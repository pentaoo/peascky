import { isJsonValue, type JsonValue } from "@pocket-jam/shared";

export type ProtocolValue = JsonValue;

export function isProtocolValue(value: unknown): value is ProtocolValue {
  return isJsonValue(value);
}
