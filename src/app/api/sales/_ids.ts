import { NextResponse } from "next/server";

// The sales proxies check an id's shape before forwarding it, mirroring the API's
// own parsePathUuid / parsePathOrderGid, so a path can never be reshaped on its
// way upstream (".." or a double-encoded escape). The answer is the API's own 400.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_GID = /^gid:\/\/shopify\/(Order|DraftOrder)\/\d+$/;

export const isUuid = (s: string): boolean => UUID.test(s);
export const isOrderGid = (s: string): boolean => ORDER_GID.test(s);

export function badId(): NextResponse {
  return NextResponse.json({ error: "Bad request", code: "SALES_BAD_ID" }, { status: 400 });
}
