import { Resend } from "resend";

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { success: false, error: "Contact service is temporarily unavailable" },
      { status: 503 }
    );
  }

  try {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_CONTACT_FROM_EMAIL?.trim()
      || "Corey – TradesStack <hello@mail.tradesstack.com>";
    const to = process.env.CONTACT_RECIPIENT_EMAIL?.trim() || "hi@tradesstack.com";
    const body = await req.json();
    const { firstName, lastName, email, phone, country, message } = body;

    const { data, error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: "New Contact Form Submission",
      html: `
        <h2>New enquiry</h2>
        <p><strong>Name:</strong> ${firstName ?? ""} ${lastName ?? ""}</p>
        <p><strong>Email:</strong> ${email ?? ""}</p>
        <p><strong>Phone:</strong> ${phone ?? ""}</p>
        <p><strong>Country:</strong> ${country ?? ""}</p>
        <p><strong>Message:</strong><br/>${message ?? ""}</p>
      `,
    });

    if (error) {
      console.error("Contact email delivery failed.");
      return Response.json({ success: false, error: "Failed to send email" }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch {
    console.error("Contact email request failed.");
    return Response.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    );
  }
}
