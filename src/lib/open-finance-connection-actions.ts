import type {BankConnection} from "./open-finance-display";
export type BankConnectionAction="refresh"|"revoke"|"recreate"|"remove"|"restore";
export function canArchiveBankConnection(connection:BankConnection):boolean {
  return !connection.archived_at && typeof connection.has_imported_data==="boolean"
    && ["pending","error","expired","revoking","revoked"].includes(connection.status);
}
export function canDisconnectBank(connection:BankConnection):boolean {
  return !connection.archived_at
    && (connection.status==="active"
      || (connection.has_imported_data!==false&&["pending","revoking"].includes(connection.status))
      || (connection.has_imported_data===true&&["error","expired"].includes(connection.status)));
}
