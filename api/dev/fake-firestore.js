/**
 * Testler için Firestore'un bu projede kullanılan alt kümesinin bellek içi taklidi.
 * (Firestore emülatörü indirilemeyen ortamlarda iş mantığını uçtan uca sınamak için.)
 * Transaction'lar sıraya alınır; yazmalar fonksiyon başarıyla biterse topluca uygulanır.
 */
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

class Increment { constructor(n) { this.n = n; } }
class ArrayUnion { constructor(items) { this.items = items; } }
export const FieldValue = {
  increment: (n) => new Increment(n),
  arrayUnion: (...items) => new ArrayUnion(items),
};
export const AggregateField = {
  count: () => ({ kind: 'count' }),
  sum: (field) => ({ kind: 'sum', field }),
};

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    o = o[k];
  }
  const last = keys.at(-1);
  if (value instanceof Increment) o[last] = (Number(o[last]) || 0) + value.n;
  else if (value instanceof ArrayUnion) o[last] = [...new Set([...(o[last] || []), ...value.items])];
  else o[last] = clone(value);
}

export class FakeFirestore {
  constructor() {
    this.store = new Map(); // path → data
    this.queue = Promise.resolve();
  }
  settings() {}
  reset() { this.store.clear(); }

  doc(path) { return new DocRef(this, path); }
  collection(name) { return new Query(this, name); }

  batch() {
    const ops = [];
    return {
      set: (ref, data) => ops.push(() => this._set(ref.path, data)),
      delete: (ref) => ops.push(() => this.store.delete(ref.path)),
      commit: async () => ops.forEach((op) => op()),
    };
  }

  runTransaction(fn) {
    const run = async () => {
      const writes = [];
      const tx = {
        get: async (ref) => ref.get(),
        create: (ref, data) => writes.push(() => {
          if (this.store.has(ref.path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
          this._set(ref.path, data);
        }),
        set: (ref, data) => writes.push(() => this._set(ref.path, data)),
        update: (ref, data) => writes.push(() => this._update(ref.path, data)),
        delete: (ref) => writes.push(() => this.store.delete(ref.path)),
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  _set(path, data) {
    const out = {};
    for (const [k, v] of Object.entries(data)) setPath(out, k, v);
    this.store.set(path, out);
  }
  _update(path, data) {
    if (!this.store.has(path)) throw new Error(`NOT_FOUND ${path}`);
    const cur = this.store.get(path);
    for (const [k, v] of Object.entries(data)) setPath(cur, k, v);
  }
}

class DocSnap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; }
  data() { return clone(this._d); }
}

class DocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  async get() { return new DocSnap(this, this.db.store.get(this.path)); }
  async set(data) { this.db._set(this.path, data); }
  async create(data) {
    if (this.db.store.has(this.path)) throw new Error('ALREADY_EXISTS');
    this.db._set(this.path, data);
  }
  async update(data) { this.db._update(this.path, data); }
  async delete() { this.db.store.delete(this.path); }
}

class Query {
  constructor(db, name, filters = [], orders = [], lim = Infinity) {
    Object.assign(this, { db, name, filters, orders, lim });
  }
  where(field, op, value) { return new Query(this.db, this.name, [...this.filters, { field, op, value }], this.orders, this.lim); }
  orderBy(field, dir = 'asc') { return new Query(this.db, this.name, this.filters, [...this.orders, { field, dir }], this.lim); }
  limit(n) { return new Query(this.db, this.name, this.filters, this.orders, n); }

  _rows() {
    const prefix = `${this.name}/`;
    let rows = [...this.db.store.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, d]) => ({ path: p, d }));
    for (const f of this.filters) {
      rows = rows.filter(({ d }) => {
        const v = getPath(d, f.field);
        if (v === undefined) return false;
        if (f.op === '>') return v > f.value;
        if (f.op === '==') return v === f.value;
        throw new Error(`op desteklenmiyor: ${f.op}`);
      });
    }
    for (const o of this.orders) rows = rows.filter(({ d }) => getPath(d, o.field) !== undefined);
    rows.sort((a, b) => {
      for (const o of this.orders) {
        const x = getPath(a.d, o.field), y = getPath(b.d, o.field);
        if (x !== y) return (x < y ? -1 : 1) * (o.dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
    return rows.slice(0, this.lim);
  }
  async get() {
    const docs = this._rows().map(({ path, d }) => new DocSnap(new DocRef(this.db, path), d));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  count() { return { get: async () => ({ data: () => ({ count: this._rows().length }) }) }; }
  aggregate(spec) {
    return {
      get: async () => {
        const rows = this._rows();
        const out = {};
        for (const [k, a] of Object.entries(spec)) {
          out[k] = a.kind === 'count' ? rows.length : rows.reduce((s, { d }) => s + (Number(getPath(d, a.field)) || 0), 0);
        }
        return { data: () => out };
      },
    };
  }
}
