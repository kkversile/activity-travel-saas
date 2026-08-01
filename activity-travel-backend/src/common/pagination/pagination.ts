import { BadRequestException } from "@nestjs/common";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function parsePaginationQuery(query: PaginationQuery, allowedSortFields: readonly string[], defaultSort = "createdAt") {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  if (!Number.isInteger(page) || page < 1) throw new BadRequestException("page must be a positive integer");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException("pageSize must be between 1 and 100");
  const sortBy = query.sortBy ?? defaultSort;
  if (!allowedSortFields.includes(sortBy)) throw new BadRequestException("Invalid sort field");
  const sortOrder = query.sortOrder === "desc" ? "desc" : "asc";
  return { page, pageSize, search: query.search?.trim() || undefined, sortBy, sortOrder };
}

export function paginationMeta(page: number, pageSize: number, totalItems: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return { page, pageSize, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

export function paginated<T>(data: T[], page: number, pageSize: number, totalItems: number): PaginatedResponse<T> {
  return { data, meta: paginationMeta(page, pageSize, totalItems) };
}
