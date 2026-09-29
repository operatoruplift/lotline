-- Saved plans and cloud reminders may hold the pinned crypto that
-- LOTLINE_CRYPTO_ENABLED adds to the stock planner (lib/domain/crypto-assets.ts).
-- Only the mint allowlist changes: the eight crypto mints are appended after the
-- 832 issuer-confirmed xStocks, and every other rule (ten assets, unique mints,
-- weights totalling 10,000 bps) stays as it is. The reviewed definition is
-- edited in place rather than restated, so no xStock mint can be mistyped; it
-- stops if the definition is not the reviewed one, and does nothing if already
-- applied. Execution still refuses crypto in its own validator.
do $migration$
declare
  definition text := pg_get_functiondef('lotline_private.valid_plan_allocations(jsonb)'::regprocedure);
  last_stock constant text := '''XsRPgsEQ3dFR84DhMv18jtob5D77FivAsTTsv1jCYmv''';
  crypto constant text := ', ''So11111111111111111111111111111111111111112'', ''cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij'', ''3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh'', ''7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'', ''J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'', ''mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'', ''jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v'', ''5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm''';
begin
  if position('So11111111111111111111111111111111111111112' in definition) > 0 then return; end if;
  if (length(definition) - length(replace(definition, last_stock, ''))) / length(last_stock) <> 1 then
    raise exception 'valid_plan_allocations is not the reviewed definition; review it before adding crypto';
  end if;
  execute replace(definition, last_stock, last_stock || crypto);
end;
$migration$;
