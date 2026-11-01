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

export const slotKey = (slot: string) => slot.replace(/\D/g, '');
