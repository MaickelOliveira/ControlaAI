import type {BankConnection} from "./open-finance-display";
export type BankConnectionAction="refresh"|"revoke"|"recreate"|"remove"|"restore";
export function canRemoveBankAttempt(connection:BankConnection):boolean {
  return connection.has_imported_data===false && ["pending","error","expired","revoking","revoked"].includes(connection.status);
}
