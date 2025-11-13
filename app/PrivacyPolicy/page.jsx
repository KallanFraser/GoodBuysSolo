/** @format */
"use client";

import "../../styles/privacy-policy.css";

export default function PrivacyPolicy() {
	return (
		<main id="privacy-policy">
			<div className="privacy-inner">
				<section className="privacy-hero">
					<p className="privacy-pill">Legal</p>
					<h1 className="privacy-title">Privacy Policy</h1>
					<p className="privacy-lede">
						This page explains what data GoodBuys collects, how we use it, and the choices you have when using the service.
					</p>
					<p className="privacy-meta">Last updated: 2025</p>
				</section>

				<section className="privacy-body">
					<article className="privacy-card">
						<section className="privacy-section">
							<h2>1. What this policy covers</h2>
							<p>
								This Privacy Policy applies to the GoodBuys website and any related tools or features we provide. By
								using GoodBuys, you agree to the data practices described here.
							</p>
						</section>

						<section className="privacy-section">
							<h2>2. Information we collect</h2>
							<p>Depending on how you use GoodBuys, we may collect:</p>
							<ul>
								<li>
									<strong>Usage data</strong>, such as pages you visit, features you interact with, search terms,
									and basic technical info (browser type, approximate region, device type).
								</li>
								<li>
									<strong>Technical logs</strong>, such as IP address and request metadata, mainly for security
									and debugging.
								</li>
								<li>
									<strong>Contact information</strong> that you choose to provide (for example, when you send us a
									message through a contact form).
								</li>
							</ul>
							<p>
								We do not intentionally collect sensitive categories of data (such as health, political opinions, or
								similar) through normal use of the site.
							</p>
						</section>

						<section className="privacy-section">
							<h2>3. How we use your information</h2>
							<p>We use the information we collect to:</p>
							<ul>
								<li>Operate, maintain, and improve the GoodBuys site and features;</li>
								<li>Understand how people use the service so we can make it more useful;</li>
								<li>Respond to questions, feedback, or support requests you send us;</li>
								<li>Protect the security and integrity of the site and our users.</li>
							</ul>
							<p>
								We do not sell your personal information. If we ever rely on your data for new purposes beyond what is
								listed here, we will update this policy and, where necessary, ask for your consent.
							</p>
						</section>

						<section className="privacy-section">
							<h2>4. Cookies and analytics</h2>
							<p>
								GoodBuys may use cookies or similar technologies to remember basic preferences and to understand
								traffic patterns (for example, which pages are visited most often).
							</p>
							<p>
								If analytics tools are used, they are configured to focus on aggregate trends rather than tracking
								individuals. You can typically manage cookies through your browser settings.
							</p>
						</section>

						<section className="privacy-section">
							<h2>5. Data sharing</h2>
							<p>
								We may share limited information with service providers who help us run the site (for example,
								hosting, logging, or analytics vendors). These providers are only allowed to use data as needed to
								perform services on our behalf.
							</p>
							<p>
								We may also disclose information if required by law, court order, or to protect the rights, property,
								or safety of GoodBuys, our users, or others.
							</p>
						</section>

						<section className="privacy-section">
							<h2>6. Data retention</h2>
							<p>
								We keep personal information only for as long as it is reasonably necessary for the purposes described
								in this policy, or as required by law. Logs and analytics data may be retained for a limited period to
								help us monitor performance and security.
							</p>
						</section>

						<section className="privacy-section">
							<h2>7. Your choices</h2>
							<p>Depending on where you live, you may have rights such as:</p>
							<ul>
								<li>Requesting access to the personal information we hold about you;</li>
								<li>Requesting correction or deletion of your information, where applicable;</li>
								<li>Objecting to or limiting certain types of processing.</li>
							</ul>
							<p>
								If you want to exercise these rights or ask about your data, contact us using the details provided on
								the site. We may need to verify your identity before responding.
							</p>
						</section>

						<section className="privacy-section">
							<h2>8. Children’s privacy</h2>
							<p>
								GoodBuys is not designed for children under the age of 13, and we do not knowingly collect personal
								data from children. If you believe a child has provided us with personal information, please contact
								us so we can take appropriate action.
							</p>
						</section>

						<section className="privacy-section">
							<h2>9. Changes to this policy</h2>
							<p>
								We may update this Privacy Policy from time to time. When we do, we will update the “Last updated”
								date at the top of the page. If you continue to use GoodBuys after changes take effect, you are
								agreeing to the revised policy.
							</p>
						</section>

						<section className="privacy-section">
							<h2>10. Contact</h2>
							<p>
								If you have questions about this policy or how we handle your data, you can reach out using the
								contact options listed on the site.
							</p>
						</section>
					</article>
				</section>
			</div>
		</main>
	);
}
