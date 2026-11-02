import { handlePaymentWebhook } from "../handler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlePaymentWebhook("PAYSTACK", req);
}
