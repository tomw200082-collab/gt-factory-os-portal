import type { UserDto } from "@/lib/contracts/dto";

export const SEED_USERS: UserDto[] = [
  {
    id: "u_op_01",
    email: "operator@fake.gtfactory",
    display_name: "Avi Cohen",
    role: "operator",
    active: true,
    last_login_at: "2026-04-13T08:14:00Z",
  },
  {
    id: "u_op_02",
    email: "noa@fake.gtfactory",
    display_name: "Noa Peled",
    role: "operator",
    active: true,
    last_login_at: "2026-04-14T06:02:00Z",
  },
  {
    id: "u_pl_01",
    email: "planner@fake.gtfactory",
    display_name: "Tom",
    role: "planner",
    active: true,
    last_login_at: "2026-04-14T11:20:00Z",
  },
  {
    id: "u_pl_02",
    email: "alex@fake.gtfactory",
    display_name: "Alex",
    role: "planner",
    active: true,
    last_login_at: "2026-04-13T17:45:00Z",
  },
  {
    id: "u_ad_01",
    email: "admin@fake.gtfactory",
    display_name: "System admin",
    role: "admin",
    active: true,
    last_login_at: "2026-04-12T09:00:00Z",
  },
  {
    id: "u_vw_01",
    email: "viewer@fake.gtfactory",
    display_name: "Guest viewer",
    role: "viewer",
    active: true,
    last_login_at: "2026-04-10T12:00:00Z",
  },
];
