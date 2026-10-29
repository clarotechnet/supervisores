// Test import-map substitute. No production API calls.
export const mock = {
  role: "admin",
  status: "active",
  authenticated: true,
  sheet: {} as Record<string, unknown>,
  rowsByTable: {} as Record<string, Record<string, unknown> | null>,
  access: null as Record<string, unknown> | null,
  auditError: null as { message: string } | null,
  mutationCalls: [] as Array<{ table: string; operation: string; values: unknown }>,
  requests: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  queryCalls: [] as Array<{ table: string; filters: Record<string, unknown>; range?: number[] }>,
  rpcError: null as null | { code: string; message: string },
  metadataAuditReady: false,
  queryError: null as null | { code: string; message: string },
};
const userId = "00000000-0000-0000-0000-000000000001";
// Production is typechecked independently against the real SDK.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(..._args: unknown[]): any {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: mock.authenticated ? { id: userId } : null },
          error: mock.authenticated ? null : Error("invalid token"),
        }),
    },
    from(table: string) {
      const call: { table: string; filters: Record<string, unknown>; range?: number[] } = {
        table,
        filters: {},
      };
      mock.queryCalls.push(call);
      const builder = {
        select: () => builder,
        is: () => builder,
        contains: () => builder,
        insert: (values: unknown) => {
          mock.mutationCalls.push({ table, operation: "insert", values });
          return builder;
        },
        update: (values: unknown) => {
          mock.mutationCalls.push({ table, operation: "update", values });
          return builder;
        },
        single: () => Promise.resolve({ data: { id: "audit-fixture" }, error: mock.auditError }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: mock.queryError }).then(resolve),
        eq: (field: string, value: unknown) => {
          call.filters[field] = value;
          return builder;
        },
        order: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "profiles"
                ? { role: mock.role, status: mock.status }
                : table === "schedule_control_access"
                  ? mock.access
                  : Object.hasOwn(mock.rowsByTable, table)
                    ? mock.rowsByTable[table]
                    : mock.sheet,
            error: table === "profiles" ? null : mock.queryError,
          }),
        range: (from: number, to: number) => {
          call.range = [from, to];
          return Promise.resolve({ data: mock.requests, count: 150, error: mock.queryError });
        },
        limit: () => Promise.resolve({ data: mock.events, error: mock.queryError }),
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      mock.rpcCalls.push({ name, args });
      return Promise.resolve({
        data:
          name === "schedule_operational_publish"
            ? "official-id"
            : name === "schedule_operational_metadata_audit_ready"
              ? mock.metadataAuditReady
              : null,
        error: mock.rpcError,
      });
    },
  };
}
