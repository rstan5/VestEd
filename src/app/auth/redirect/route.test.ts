import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "./route";

test("the auth redirect keeps a relative, same-site Location", () => {
  const ok = GET(new Request("http://localhost:3100/auth/redirect?to=%2Flogin%3Fnext%3D%252Fportfolio"));
  assert.equal(ok.status, 307);
  assert.equal(ok.headers.get("location"), "/login?next=%2Fportfolio");
  assert.match(ok.headers.get("cache-control") ?? "", /no-store/);
});

test("the auth redirect refuses off-site targets", () => {
  for (const to of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    const response = GET(new Request(`http://localhost:3100/auth/redirect?to=${encodeURIComponent(to)}`));
    assert.equal(response.headers.get("location"), "/login", to);
  }
});
