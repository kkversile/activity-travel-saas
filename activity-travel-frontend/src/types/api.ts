export type PaginationMeta = { page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
export type PaginatedResponse<T> = { data: T[]; meta: PaginationMeta };
export type ApiError = { message?: string; requestId?: string };
