ALTER TABLE "inventory_reservations" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM inventory_reservations reservation
    JOIN order_items item
      ON item.id = reservation.order_item_id
     AND item.order_id = reservation.order_id
     AND item.product_id = reservation.product_id
    JOIN lots lot
      ON lot.id = reservation.lot_id
     AND lot.product_id = reservation.product_id
    WHERE NOT (
      (item.variant_id IS NULL AND lot.variant_id IS NULL)
      OR (item.variant_id IS NOT NULL AND lot.variant_id = item.variant_id)
    )
  ) THEN
    RAISE EXCEPTION 'inventory reservation variant reconciliation required';
  END IF;
END;
$$;--> statement-breakpoint
UPDATE inventory_reservations reservation
SET variant_id = item.variant_id
FROM order_items item, lots lot
WHERE item.id = reservation.order_item_id
  AND item.order_id = reservation.order_id
  AND item.product_id = reservation.product_id
  AND lot.id = reservation.lot_id
  AND lot.product_id = reservation.product_id
  AND item.variant_id IS NOT NULL
  AND lot.variant_id = item.variant_id;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_id_product_variant_unique" UNIQUE("id","product_id","variant_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_id_order_product_variant_unique" UNIQUE("id","order_id","product_id","variant_id");--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_item_order_product_variant_fk" FOREIGN KEY ("order_item_id","order_id","product_id","variant_id") REFERENCES "public"."order_items"("id","order_id","product_id","variant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_lot_product_variant_fk" FOREIGN KEY ("lot_id","product_id","variant_id") REFERENCES "public"."lots"("id","product_id","variant_id") ON DELETE restrict ON UPDATE no action;
