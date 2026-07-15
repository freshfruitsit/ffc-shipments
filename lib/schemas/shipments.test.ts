import { describe, it, expect } from "vitest";
import { CreateShipmentSchema, AddSupplierSchema } from "@/lib/schemas/shipments";
import { LoginSchema } from "@/lib/schemas/auth";

const validShipment = {
  branch_id: "a1b2c3d4-e5f6-4789-a123-456789abcdef",
  supplier_id: "b2c3d4e5-f6a7-4890-b234-56789abcdef0",
  shipment_date: "2026-03-15",
  responsible: "c3d4e5f6-a7b8-4901-8345-6789abcdef01",
  priority: "Medium",
};

describe("CreateShipmentSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(CreateShipmentSchema.safeParse(validShipment).success).toBe(true);
  });

  it("defaults mode to Air when omitted (Phase 1 wizard doesn't collect it)", () => {
    const { priority: _p, ...rest } = validShipment;
    void _p;
    const result = CreateShipmentSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mode).toBe("Air");
  });

  it("rejects a missing responsible user (required by the wizard's Basic Info step)", () => {
    const { responsible: _r, ...rest } = validShipment;
    void _r;
    const result = CreateShipmentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("allows priority to be omitted (the wizard's Basic Info step doesn't collect it — RPC defaults to Medium)", () => {
    const { priority: _p, ...rest } = validShipment;
    void _p;
    expect(CreateShipmentSchema.safeParse(rest).success).toBe(true);
  });

  it("accepts Critical as a valid priority (item 5 requirement)", () => {
    const result = CreateShipmentSchema.safeParse({ ...validShipment, priority: "Critical" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid priority value", () => {
    const result = CreateShipmentSchema.safeParse({ ...validShipment, priority: "Extreme" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID branch_id", () => {
    const result = CreateShipmentSchema.safeParse({ ...validShipment, branch_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing shipment_date", () => {
    const { shipment_date: _unused, ...rest } = validShipment;
    void _unused;
    const result = CreateShipmentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("allows category_id/origin_country_id/supplier_id to be omitted (empty string)", () => {
    const result = CreateShipmentSchema.safeParse({
      ...validShipment,
      category_id: "",
      origin_country_id: "",
      supplier_id: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("AddSupplierSchema", () => {
  it("accepts a valid supplier name", () => {
    expect(AddSupplierSchema.safeParse({ name: "Nile Delta Produce Ltd." }).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(AddSupplierSchema.safeParse({ name: "X" }).success).toBe(false);
  });

  it("rejects a whitespace-only name (trimmed length check)", () => {
    expect(AddSupplierSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts a valid email/password pair", () => {
    expect(LoginSchema.safeParse({ email: "sara@ffc.example", password: "hunter2" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(LoginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(LoginSchema.safeParse({ email: "sara@ffc.example", password: "" }).success).toBe(false);
  });
});
