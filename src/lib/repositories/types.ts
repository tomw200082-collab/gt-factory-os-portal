import type {
  BomHeadDto,
  ComponentDto,
  ItemDto,
  PlanningPolicyDto,
  SupplierDto,
  SupplierItemDto,
  UserDto,
} from "@/lib/contracts/dto";

export interface QueryListParams {
  query?: string;
  includeArchived?: boolean;
  limit?: number;
}

export interface Repository<TDto> {
  list(params?: QueryListParams): Promise<TDto[]>;
  get(id: string): Promise<TDto | null>;
  create(draft: Omit<TDto, "id" | "audit"> & { id?: string }): Promise<TDto>;
  update(id: string, patch: Partial<TDto>, expectedVersion: number): Promise<TDto>;
  setActive(id: string, active: boolean): Promise<TDto>;
}

export type ItemsRepo = Repository<ItemDto>;
export type ComponentsRepo = Repository<ComponentDto>;
export type SuppliersRepo = Repository<SupplierDto>;
export type SupplierItemsRepo = Repository<SupplierItemDto>;
export type PlanningPolicyRepo = Repository<PlanningPolicyDto>;
export type UsersRepo = Repository<UserDto> & {
  list(params?: QueryListParams): Promise<UserDto[]>;
};
export interface BomsRepo {
  list(params?: QueryListParams): Promise<BomHeadDto[]>;
  get(id: string): Promise<BomHeadDto | null>;
  create(draft: { item_id: string; item_name: string }): Promise<BomHeadDto>;
  addVersion(headId: string, expectedVersion: number): Promise<BomHeadDto>;
  activateVersion(headId: string, versionId: string, expectedVersion: number): Promise<BomHeadDto>;
  updateLines(
    headId: string,
    versionId: string,
    lines: BomHeadDto["versions"][number]["lines"],
    expectedVersion: number
  ): Promise<BomHeadDto>;
}
