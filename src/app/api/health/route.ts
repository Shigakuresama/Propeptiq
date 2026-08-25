import { NextResponse } from "next/server";

import { brand, launchGates, jurisdictionMatrix } from "@/lib/platform";

export function GET() {
  return NextResponse.json({
    status: "ok",
    brand: brand.name,
    stage: "scaffolded",
    launchGates: launchGates.length,
    jurisdictionStates: jurisdictionMatrix.map((item) => item.state),
  });
}
