import express from 'express';
import { auth } from './firebase.js';
import { publicConfig, roleOf } from './config.js';
import { ApiError } from './validate.js';
import * as svc from './service.js';

/** Authorization: Bearer <Firebase ID token> doğrulaması. */
async function requireAuth(req, _res, next) {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) throw new ApiError(401, 'UNAUTHENTICATED', 'Oturumun kapanmış. Gmail ile tekrar giriş yap.');
  try {
    req.user = await auth.verifyIdToken(m[1]);
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Oturumun kapanmış. Gmail ile tekrar giriş yap.');
  }
  next();
}

const requireRole = (...roles) => async (req, _res, next) => {
  const role = await roleOf(req.user.email);
  if (!roles.includes(role)) throw new ApiError(403, 'FORBIDDEN', 'Bu ekran yalnızca görevliler içindir.');
  req.role = role;
  next();
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '10kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));

  api.get('/config', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.json(await publicConfig());
  });

  api.get('/leaderboard', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=10, s-maxage=15');
    res.json(await svc.leaderboard());
  });

  api.post('/register', requireAuth, async (req, res) => {
    res.status(201).json(await svc.register(req.user, req.body));
  });

  api.get('/me', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await svc.getMe(req.user));
  });

  api.post('/redeem', requireAuth, async (req, res) => {
    res.json(await svc.redeem(req.user.uid, req.body?.code));
  });

  api.get('/staff/codes', requireAuth, requireRole('staff', 'admin'), async (_req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await svc.staffCodes());
  });

  api.post('/staff/redeem', requireAuth, requireRole('staff', 'admin'), async (req, res) => {
    res.json(await svc.staffRedeem(req.user.email, req.body?.email, req.body?.code));
  });

  api.get('/admin/stats', requireAuth, requireRole('admin'), async (_req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await svc.stats());
  });

  api.get('/admin/export', requireAuth, requireRole('admin'), async (req, res) => {
    const mode = ['ozet', 'hak', 'oturum'].includes(req.query.mode) ? req.query.mode : 'ozet';
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="devfest-pasaport-${mode}.csv"`);
    res.send(await svc.exportCsv(mode));
  });

  app.use('/api', api);
  app.use('/api', (_req, _res) => {
    throw new ApiError(404, 'NO_ROUTE', 'Böyle bir uç yok.');
  });

  // Hata yakalayıcı: ApiError → JSON; diğer her şey 500
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'İstek okunamadı.' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Sunucuda bir sorun oluştu. Birkaç saniye sonra tekrar dene.' } });
  });

  return app;
}
