"use client";

import { Footer } from "@/components/marketing/Footer";
import { Navbar } from "@/components/marketing/Navbar";
import { useAuth } from "@/hooks/use-auth";
import { akzidenzBlack, akzidenzProBoldEx } from "@/lib/fonts";

export default function PrivacyPolicyPage() {
  const { session } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F4EFE6] text-[#0B2639]">
      <main>
        <Navbar session={session} loginHref="/login" />

        <section className="px-6 pb-16 pt-28 lg:px-16 lg:pt-32">
          <div className="mx-auto w-full max-w-[1000px]">
            <h1
              className={`${akzidenzProBoldEx.className} text-[44px] font-bold uppercase leading-[0.92] tracking-[-0.05em] text-[#0B2639] sm:text-[58px] lg:text-[72px]`}
            >
              Privacy Policy
            </h1>
            <p className={`${akzidenzBlack.className} mt-4 text-base text-[#0B2639]/70`}>
              Last Updated: March 10, 2026
            </p>

            <div className="mt-8 rounded-[28px] border border-[#0B2639]/8 bg-white p-6 shadow-[0_18px_40px_rgba(11,38,57,0.08)] sm:p-8 lg:p-10">
              <div
                className={`${akzidenzBlack.className} space-y-7 text-[16px] leading-[1.75] text-[#0B2639]/88 [&_h2]:!text-[#0B2639] [&_h2]:tracking-[-0.03em] [&_h3]:!text-[#0B2639] [&_p]:text-[#0B2639]/88 [&_ul]:text-[#0B2639]/88`}
              >
                <p>
                  TradesStack ("TradesStack", "we", "our", or "us") operates a cloud-based software platform designed for construction
                  professionals including builders, estimators, quantity surveyors, and project managers.
                </p>
                <p>
                  This Privacy Policy explains how we collect, use, store, and protect personal information and project data when you use
                  the TradesStack platform and related services.
                </p>
                <p>By using TradesStack, you agree to the collection and use of information in accordance with this policy.</p>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">1. Information We Collect</h2>
                  <p className="mt-3">We collect several types of information in order to operate and improve the TradesStack platform.</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Account Information</h3>
                  <p className="mt-2">When you create an account we may collect:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Name</li>
                    <li>Email address</li>
                    <li>User ID</li>
                    <li>Organization membership</li>
                    <li>User role or permissions within an organization</li>
                  </ul>
                  <p className="mt-2">Authentication is managed through Supabase Auth.</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Organization and Project Data</h3>
                  <p className="mt-2">TradesStack is a multi-tenant platform where users belong to organizations and collaborate within projects.</p>
                  <p className="mt-2">Information stored may include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Organization identifiers</li>
                    <li>Project names and identifiers</li>
                    <li>Project metadata</li>
                    <li>Organization membership relationships</li>
                    <li>User permissions within projects</li>
                  </ul>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Uploaded Files</h3>
                  <p className="mt-2">Users may upload documents to the platform for analysis.</p>
                  <p className="mt-2">These may include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Construction drawing PDFs</li>
                    <li>Supporting documents or files related to projects</li>
                  </ul>
                  <p className="mt-2">Metadata stored may include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>File name</li>
                    <li>File path</li>
                    <li>File size</li>
                    <li>File type</li>
                    <li>Upload timestamps</li>
                    <li>Associated project identifiers</li>
                  </ul>
                  <p className="mt-2">Files are stored in secure cloud storage managed through Supabase.</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">AI Processing Data</h3>
                  <p className="mt-2">TradesStack uses artificial intelligence services to analyze construction documents and generate outputs.</p>
                  <p className="mt-2">Data processed by AI systems may include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Extracted text from uploaded documents</li>
                    <li>Prompt text submitted by users</li>
                    <li>AI-generated outputs including:</li>
                  </ul>
                  <ul className="mt-1 list-disc space-y-1 pl-12">
                    <li>Trade packs</li>
                    <li>Scope generation</li>
                    <li>Change detection results</li>
                    <li>AI assistant responses</li>
                  </ul>
                  <p className="mt-2">AI processing is performed through server-side requests to the OpenAI API.</p>
                  <p className="mt-2">No OpenAI API keys are exposed to users or client-side applications.</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Usage and Operational Data</h3>
                  <p className="mt-2">To maintain platform reliability and security we collect operational data such as:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>AI usage metrics</li>
                    <li>Request timestamps</li>
                    <li>Error logs</li>
                    <li>Processing status of AI tasks</li>
                    <li>Token or response usage statistics</li>
                  </ul>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Technical and Security Data</h3>
                  <p className="mt-2">We may collect limited technical information including:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>IP address</li>
                    <li>Network request metadata</li>
                    <li>Security and rate-limiting events</li>
                    <li>Authentication logs</li>
                  </ul>
                  <p className="mt-2">This information is used for:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Security monitoring</li>
                    <li>Abuse prevention</li>
                    <li>Platform reliability</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">2. How We Use Your Information</h2>
                  <p className="mt-3">We use collected information to operate and improve the TradesStack platform.</p>
                  <p className="mt-2">This includes:</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Platform Functionality</h3>
                  <p className="mt-2">Processing uploaded documents to generate:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Trade Pack Builder outputs</li>
                    <li>Scope Builder outputs</li>
                    <li>Change Detection analysis</li>
                    <li>AI Assistant responses</li>
                  </ul>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Account Management</h3>
                  <p className="mt-2">Managing user accounts, organization membership, and project permissions.</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Platform Security</h3>
                  <p className="mt-2">Preventing abuse, enforcing usage limits, detecting suspicious activity, and maintaining platform integrity.</p>

                  <h3 className="mt-4 text-[20px] font-semibold text-white">Service Improvement</h3>
                  <p className="mt-2">Monitoring performance and improving the accuracy and reliability of AI outputs.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">3. AI Processing</h2>
                  <p className="mt-3">TradesStack uses artificial intelligence to analyze documents and generate structured outputs.</p>
                  <p className="mt-2">AI processing may include sending relevant document text and prompts to OpenAI for analysis.</p>
                  <p className="mt-2">Important notes:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>AI processing occurs server-side only.</li>
                    <li>API credentials are not exposed to users.</li>
                    <li>Only the necessary information required to generate results is transmitted.</li>
                    <li>AI responses are generated automatically and may not always be accurate.</li>
                    <li>
                      Users should review outputs carefully before relying on them for professional, contractual, or compliance decisions.
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">4. Data Storage and Infrastructure</h2>
                  <p className="mt-3">TradesStack uses trusted cloud infrastructure providers.</p>
                  <p className="mt-2">Primary services include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>Supabase</li>
                  </ul>
                  <ul className="mt-1 list-disc space-y-1 pl-12">
                    <li>Database</li>
                    <li>Authentication</li>
                    <li>File storage</li>
                  </ul>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>OpenAI</li>
                  </ul>
                  <ul className="mt-1 list-disc space-y-1 pl-12">
                    <li>AI document processing</li>
                    <li>AI assistant responses</li>
                  </ul>
                  <p className="mt-2">
                    Data may be processed or stored on infrastructure located outside of your country depending on these providers.
                  </p>
                  <p className="mt-2">We take reasonable steps to ensure that data handling meets modern security standards.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">5. Data Access and Multi-Tenant Security</h2>
                  <p className="mt-3">TradesStack operates as a multi-tenant platform.</p>
                  <p className="mt-2">Users are organized into organizations, and data is separated by:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>organization membership</li>
                    <li>project access permissions</li>
                    <li>row-level security controls</li>
                  </ul>
                  <p className="mt-2">Security measures include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>authenticated access controls</li>
                    <li>organization-scoped project permissions</li>
                    <li>database row-level security policies</li>
                    <li>server-side authorization checks</li>
                  </ul>
                  <p className="mt-2">
                    Users should only be able to access data associated with organizations and projects they are authorized to access.
                  </p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">6. Data Retention</h2>
                  <p className="mt-3">TradesStack retains data only as long as necessary to operate the platform.</p>
                  <p className="mt-2">This may include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>user account information</li>
                    <li>uploaded documents</li>
                    <li>generated outputs</li>
                    <li>project data</li>
                    <li>AI run history</li>
                    <li>usage logs</li>
                  </ul>
                  <p className="mt-2">Retention periods may vary depending on:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>active account status</li>
                    <li>platform functionality requirements</li>
                    <li>legal or operational needs</li>
                  </ul>
                  <p className="mt-2">Users may request deletion of their data as described below.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">7. User Control and Data Deletion</h2>
                  <p className="mt-3">Users may request:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>access to their personal data</li>
                    <li>correction of inaccurate data</li>
                    <li>deletion of their account and associated information</li>
                  </ul>
                  <p className="mt-2">Account deletion may result in removal of:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>user profile information</li>
                    <li>project membership data</li>
                    <li>uploaded documents</li>
                    <li>stored AI outputs</li>
                  </ul>
                  <p className="mt-2">Some operational logs may be retained for security or compliance purposes.</p>
                  <p className="mt-2">Requests can be submitted by contacting us at the email listed below.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">8. Data Security</h2>
                  <p className="mt-3">TradesStack implements industry-standard security measures to protect user data.</p>
                  <p className="mt-2">These measures include:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>authenticated access controls</li>
                    <li>encrypted network communications (HTTPS)</li>
                    <li>server-side API access controls</li>
                    <li>rate limiting and abuse protection</li>
                    <li>database row-level security policies</li>
                  </ul>
                  <p className="mt-2">While we take reasonable steps to protect information, no internet service can guarantee absolute security.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">9. Acceptable Use of Uploaded Documents</h2>
                  <p className="mt-3">Users may upload project documents to TradesStack for analysis.</p>
                  <p className="mt-2">Users are responsible for ensuring that:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>they have permission to upload and process the documents</li>
                    <li>documents do not violate confidentiality obligations</li>
                    <li>documents do not contain unlawful content</li>
                  </ul>
                  <p className="mt-2">TradesStack does not claim ownership of user-uploaded documents.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">10. AI Output Disclaimer</h2>
                  <p className="mt-3">TradesStack provides AI-assisted construction guidance and document analysis.</p>
                  <p className="mt-2">AI outputs:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>are generated automatically</li>
                    <li>may contain inaccuracies</li>
                    <li>should not replace professional judgment</li>
                  </ul>
                  <p className="mt-2">Users should review all outputs against:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>project drawings</li>
                    <li>specifications</li>
                    <li>applicable building codes and standards</li>
                    <li>contractual requirements</li>
                  </ul>
                  <p className="mt-2">TradesStack is not responsible for decisions made based solely on AI outputs.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">11. Children's Privacy</h2>
                  <p className="mt-3">TradesStack is intended for professional use by construction industry participants.</p>
                  <p className="mt-2">The platform is not intended for individuals under the age of 18.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">12. Changes to This Privacy Policy</h2>
                  <p className="mt-3">
                    We may update this Privacy Policy periodically to reflect changes in the platform, technology, or legal requirements.
                  </p>
                  <p className="mt-2">When updates occur we will revise the "Last Updated" date.</p>
                  <p className="mt-2">Continued use of the platform after changes indicates acceptance of the updated policy.</p>
                </section>

                <section>
                  <h2 className="text-[26px] font-semibold uppercase tracking-[0.02em] text-[#F74917]">13. Contact Information</h2>
                  <p className="mt-3">If you have questions about this Privacy Policy or your data, you can contact:</p>
                  <p className="mt-2">TradesStack</p>
                  <p>Email: hi@tradesstack.com</p>
                  <p>Website: https://tradesstack.com</p>
                </section>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
