-- ============================================================
-- DATA UPDATE — not a schema change like everything before it.
--
-- Renaming an enum value (document/customs/municipality status, done
-- already) retroactively relabels existing rows automatically. Changing
-- a column's DEFAULT does not — it only affects shipments created from
-- that point forward. This is why Customs Status updated instantly
-- everywhere, but Municipality/MOFAIC/Physical Documents didn't: those
-- three used a default change, not a rename, because 'Not Required' /
-- 'Not Applicable' are genuinely different values from 'Pending', not
-- synonyms being relabeled.
--
-- This statement explicitly UPDATEs existing shipment rows that are
-- STILL sitting at the old "hasn't been determined" default, moving them
-- to 'Pending' to match. It only touches rows still at that exact
-- starting value — anything a real user already progressed (Draft,
-- Submitted, Received, Applicability Review, etc.) is left completely
-- alone, on purpose. If any of these rows had 'Not Required'/'Not
-- Applicable' deliberately SET by someone (a genuine business
-- determination, not just an untouched default), this will overwrite
-- that — there's no way to distinguish "never touched" from
-- "deliberately set to this" purely from the stored value. Worth
-- confirming that's actually fine for your data before running this.
-- ============================================================

update shipments set municipality_status = 'Pending' where municipality_status = 'Not Required';
update shipments set delivery_order_status = 'Pending' where delivery_order_status = 'Not Required';
update shipments set mofaic_status = 'Pending' where mofaic_status = 'Not Applicable';
update shipments set physical_doc_status = 'Pending' where physical_doc_status = 'Not Required';

-- Shows exactly how many rows each statement above actually changed.
select
  (select count(*) from shipments where municipality_status = 'Pending') as municipality_now_pending,
  (select count(*) from shipments where delivery_order_status = 'Pending') as delivery_order_now_pending,
  (select count(*) from shipments where mofaic_status = 'Pending') as mofaic_now_pending,
  (select count(*) from shipments where physical_doc_status = 'Pending') as physical_docs_now_pending,
  (select count(*) from shipments) as total_shipments;
