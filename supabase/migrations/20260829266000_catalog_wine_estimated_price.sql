-- Estimated market price on the catalog wine.
--
-- The cellar's value was summed from purchase prices, which most lots don't
-- carry. The label scan now asks Claude for a typical retail price at scan
-- time; users can edit it in the wine form. It lives on catalog_wines rather
-- than cellar_lots (owner decision): a market estimate is a property of the
-- wine, not of one person's purchase — and the shared catalog means one good
-- correction benefits every cellar holding that wine.
--
-- The currency is stored explicitly even though everything defaults DKK today,
-- so a future multi-currency pass converts data instead of guessing it.
alter table catalog_wines
  add column estimated_price numeric
    check (estimated_price is null or estimated_price >= 0),
  add column estimated_price_currency text not null default 'DKK'
    check (char_length(estimated_price_currency) = 3);

do $$
declare
  v_cols int;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'catalog_wines'
     and column_name in ('estimated_price', 'estimated_price_currency');
  if v_cols <> 2 then
    raise exception 'expected both estimated price columns, found %', v_cols;
  end if;

  if exists (select 1 from catalog_wines where estimated_price is not null) then
    raise exception 'new estimated_price column should start empty';
  end if;

  -- The CHECKs must actually reject bad values (both probes roll back).
  begin
    update catalog_wines set estimated_price = -1
     where id = (select id from catalog_wines limit 1);
    raise exception 'a negative estimated_price was accepted';
  exception
    when check_violation then null;
  end;
  begin
    update catalog_wines set estimated_price_currency = 'KRONER'
     where id = (select id from catalog_wines limit 1);
    raise exception 'a non-ISO currency code was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;
