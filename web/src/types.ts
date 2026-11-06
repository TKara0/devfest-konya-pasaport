export type TaskType = 'static' | 'session' | 'rotating';

export interface Step {
  id: string;
  label: string;
}

export interface Task {
  id: string;
  name: string;
  desc?: string;
  icon?: string;
  type: TaskType;
  reward: number;
  rewardLabel?: string;
  rotateMinutes?: number;
  total: number;
  steps: Step[];
}

export interface Session {
  id: string;
  slot: string; // "10:00"
  hall: string;
  title: string;
  speaker?: string;
}

export interface EventConfig {
  event: { name?: string; date?: string; venue?: string };
  tasks: Task[];
  sessions: Session[];
}

export type Role = 'staff' | 'admin' | null;

export interface Me {
  uid: string;
  /** sıralamada kendini bulmak için */
  publicId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  tickets: number;
  progress: Record<string, number>;
  done: string[];
  /** slot anahtarı ("1000") → oturum id */
  sessions: Record<string, string>;
  rank?: number | null;
  role?: Role;
  /** kazandığı (iptal edilmemiş) çekilişler; yedeklik bilgisi gösterilmez */
  wins?: Win[];
}

export interface Win {
  category: string;
  prize: string;
  status: 'bekliyor' | 'teslim edildi';
}

export interface BoardRow {
  rank: number;
  id: string;
  name: string;
  tickets: number;
}

export interface Board {
  updatedAt: number;
  participants: number;
  top: BoardRow[];
}

export interface RedeemResult {
  taskId: string;
  stepId: string;
  reward: number;
  message: string;
  user: Me;
}

export interface RotatingCode {
  taskId: string;
  name: string;
  code: string;
  previous: string;
  periodSeconds: number;
  secondsLeft: number;
}

export interface Stats {
  users: number;
  tickets: number;
  tasks: { id: string; name: string; completions: number }[];
}

/* ---------- Çekiliş (yönetici) ---------- */

export interface Raffle {
  id: string;
  name: string;
  tasks: string[];
  weight: 'tickets' | 'count';
  poolSize: number;
  totalWeight: number;
}

export type ResultStatus = 'bekliyor' | 'teslim edildi' | 'gelmedi' | 'yedekten kazanana geçti';

export interface DrawResult {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  weight: number;
  kind: 'kazanan' | 'yedek';
  order: number;
  status: ResultStatus;
}

export interface Draw {
  id: string;
  raffleId: string;
  raffleName: string;
  prize: string;
  winnersWanted: number;
  backupsWanted: number;
  winnersDrawn: number;
  backupsDrawn: number;
  poolSize: number;
  totalWeight: number;
  drawnBy: string;
  drawnAt: number;
  status: 'aktif' | 'iptal edildi';
  cancelledBy: string | null;
  cancelledAt: number | null;
  results: DrawResult[];
}

/** POST /admin/draws yanıtı: havuz yetmediyse short + message */
export interface DrawCreated extends Draw {
  short: boolean;
  message: string | null;
}

/** POST /admin/draws/:id/results/:index yanıtı */
export interface ResultUpdated extends Draw {
  promoted: { index: number; firstName: string; lastName: string; order: number } | null;
  message: string | null;
}

export const fullName = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`;

export const slotKey = (slot: string) => slot.replace(/\D/g, '');
