import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, country, message } = body;

    const { data, error } = await resend.emails.send({
      from: "Corey – TradesStack <hello@mail.tradesstack.com>",
      to: "hi@tradesstack.com",
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
      console.error("Resend error:", error);
      return Response.json({ success: false, error }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (err) {
    console.error("Contact route failed:", err);
    return Response.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    );
  }
}
