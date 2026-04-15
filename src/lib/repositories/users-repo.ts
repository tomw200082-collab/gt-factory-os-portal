"use client";

import type { UserDto } from "@/lib/contracts/dto";
import { getDb, STORES } from "./idb";
import { RepoError } from "./generic-repo";

export const usersRepo = {
  async list(params?: { query?: string; includeInactive?: boolean }): Promise<UserDto[]> {
    const db = await getDb();
    const all = (await db.getAll(STORES.users)) as UserDto[];
    const q = params?.query?.trim().toLowerCase();
    return all
      .filter((u) => (params?.includeInactive ? true : u.active))
      .filter((u) =>
        q
          ? u.display_name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  },

  async get(id: string): Promise<UserDto | null> {
    const db = await getDb();
    return ((await db.get(STORES.users, id)) as UserDto | undefined) ?? null;
  },

  async update(id: string, patch: Partial<UserDto>): Promise<UserDto> {
    const db = await getDb();
    const current = (await db.get(STORES.users, id)) as UserDto | undefined;
    if (!current) throw new RepoError("not_found", `user ${id} not found`);
    const next: UserDto = { ...current, ...patch, id };
    await db.put(STORES.users, next);
    return next;
  },

  async setActive(id: string, active: boolean): Promise<UserDto> {
    return this.update(id, { active });
  },
};
