/** @format */
"use client";

import "../../styles/terms-of-use.css";

export default function TermsOfUse() {
	return (
		<main id="terms-of-use">
			<div className="terms-inner">
				<section className="terms-hero">
					<p className="terms-pill">Legal</p>
					<h1 className="terms-title">Terms of Use</h1>
					<p className="terms-lede">
						These terms explain how GoodBuys is meant to be used, what you can expect from us, and what we expect from you
						when you use the site and related tools.
					</p>
					<p className="terms-meta">Last updated: 2025</p>
				</section>

				<section className="terms-body">
					<article className="terms-card">
						<section className="terms-section">
							<h2>1. Acceptance of these terms</h2>
							<p>
								By accessing or using GoodBuys (including our website, tools, and any features we provide), you agree
								to be bound by these Terms of Use. If you do not agree, you should not use the service.
							</p>
						</section>

						<section className="terms-section">
							<h2>2. What GoodBuys provides</h2>
							<p>
								GoodBuys helps you understand the ethical and environmental context around consumer products by
								showing associated ecolabels and related information. We pull together data from multiple sources and
								present it in a way that is easier to understand while shopping or researching brands.
							</p>
							<p>
								We do our best to keep information accurate and up to date, but we cannot guarantee that every piece
								of data is complete, current, or error-free.
							</p>
						</section>

						<section className="terms-section">
							<h2>3. Personal use only</h2>
							<p>GoodBuys is meant for personal, non-commercial use. You agree not to:</p>
							<ul>
								<li>Resell, sublicense, or commercially exploit the service or its data;</li>
								<li>Automate scraping or high-volume requests without prior written permission;</li>
								<li>Reverse engineer, bypass security, or interfere with normal operation of the site.</li>
							</ul>
						</section>

						<section className="terms-section">
							<h2>4. Accounts and submissions</h2>
							<p>
								If the service allows you to create an account, submit feedback, or upload content, you are
								responsible for everything associated with your account or submissions. You agree that anything you
								submit:
							</p>
							<ul>
								<li>Does not violate any laws or infringe on anyone else’s rights;</li>
								<li>Is accurate to the best of your knowledge;</li>
								<li>Is not abusive, hateful, or misleading.</li>
							</ul>
							<p>
								We may remove content or restrict access if we believe these terms are being violated, but we are not
								obligated to monitor all activity.
							</p>
						</section>

						<section className="terms-section">
							<h2>5. No professional or legal advice</h2>
							<p>
								Information provided by GoodBuys is for general informational purposes only. It is not legal,
								financial, or professional advice. You are responsible for how you use the information and for any
								decisions you make based on it.
							</p>
						</section>

						<section className="terms-section">
							<h2>6. Third-party content and links</h2>
							<p>
								GoodBuys may reference external sites, ecolabel standards, or third-party resources. Those sites are
								not controlled by us, and we are not responsible for their content, policies, or actions. Following
								any link or relying on any external resource is at your own risk.
							</p>
						</section>

						<section className="terms-section">
							<h2>7. Service changes and availability</h2>
							<p>
								We may update, pause, or discontinue parts of the service at any time, with or without notice. We do
								not promise that the service will always be available, uninterrupted, or bug-free.
							</p>
						</section>

						<section className="terms-section">
							<h2>8. Limitation of liability</h2>
							<p>
								To the maximum extent permitted by law, GoodBuys and its contributors will not be liable for any
								indirect, incidental, consequential, or punitive damages arising out of or related to your use of the
								service, even if we have been advised of the possibility of such damages.
							</p>
							<p>
								If we are found to be liable for any claim, our total liability will be limited to the amount you paid
								(if any) to use the service in the twelve (12) months before the claim arose.
							</p>
						</section>

						<section className="terms-section">
							<h2>9. Changes to these terms</h2>
							<p>
								We may update these Terms of Use from time to time. When we do, we will update the “Last updated” date
								at the top of the page. If you continue to use the service after changes take effect, you are agreeing
								to the updated terms.
							</p>
						</section>

						<section className="terms-section">
							<h2>10. Contact</h2>
							<p>
								If you have questions about these terms or how GoodBuys works, you can reach out through the contact
								options provided on the site.
							</p>
						</section>
					</article>
				</section>
			</div>
		</main>
	);
}
