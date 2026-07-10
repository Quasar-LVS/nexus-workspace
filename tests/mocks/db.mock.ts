import { vi } from "vitest";

export class SupabaseQueryMock {
  public data: any = null;
  public error: any = null;

  // Stored inputs to verify in expectations
  public insertedPayload: any = null;
  public updatedPayload: any = null;
  public deletedFilters: any[] = [];
  public selectFields: string = "";
  public filters: Record<string, any> = {};

  constructor(options?: { data?: any; error?: any }) {
    if (options) {
      this.data = options.data;
      this.error = options.error;
    }
  }

  from(table: string) {
    return this;
  }

  select(fields: string = "*") {
    this.selectFields = fields;
    return this;
  }

  insert(payload: any) {
    this.insertedPayload = payload;
    return this;
  }

  update(payload: any) {
    this.updatedPayload = payload;
    return this;
  }

  delete() {
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  in(column: string, values: any[]) {
    this.filters[column] = { $in: values };
    return this;
  }

  order(column: string, options?: any) {
    return this;
  }

  limit(count: number) {
    return this;
  }

  single() {
    // If data is an array, return first item, else data
    const result = Array.isArray(this.data) ? this.data[0] : this.data;
    return Promise.resolve({
      data: result,
      error: this.error,
    });
  }

  then(onfulfilled?: (value: { data: any; error: any }) => any) {
    const promise = Promise.resolve({ data: this.data, error: this.error });
    return onfulfilled ? promise.then(onfulfilled) : promise;
  }
}

// Global factory helper to create mock instances
export function createSupabaseMock(data?: any, error?: any) {
  return new SupabaseQueryMock({ data, error });
}
