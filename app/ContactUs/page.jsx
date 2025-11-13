/** @format */
"use client";

import { useState } from "react";
import "../../styles/contact-us.css";

export default function ContactUs() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [status, setStatus] = useState("idle"); // idle | loading | success | error
	const [error, setError] = useState("");

	const handleSubmit = async (e) => {
		e.preventDefault();
		setStatus("loading");
		setError("");

		try {
			const res = await fetch("/api/contact", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name, email, message }),
			});

			if (!res.ok) {
				throw new Error("Failed to save form entry.");
			}

			setStatus("success");
			setName("");
			setEmail("");
			setMessage("");
		} catch (err) {
			console.error(err);
			setStatus("error");
			setError("Something went wrong saving your message. Please try again.");
		}
	};

	return (
		<main id="contact-us">
			<div className="contact-inner">
				<section className="contact-hero">
					<p className="contact-pill">Contact GoodBuys</p>
					<h1 className="contact-title">
						Let&rsquo;s talk about
						<br />
						better ways to buy.
					</h1>
					<p className="contact-lede">
						Questions, ideas, or want to collaborate? Drop us a message and we&rsquo;ll get back to you.
					</p>
				</section>

				<section className="contact-grid">
					<article className="contact-card">
						<h2 className="contact-heading">Send us a message</h2>
						<form className="contact-form" onSubmit={handleSubmit}>
							<div className="form-field">
								<label htmlFor="name">Name</label>
								<input
									id="name"
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Your name"
									required
								/>
							</div>

							<div className="form-field">
								<label htmlFor="email">Email</label>
								<input
									id="email"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@example.com"
									required
								/>
							</div>

							<div className="form-field">
								<label htmlFor="message">Your message</label>
								<textarea
									id="message"
									rows={5}
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									placeholder="What’s on your mind?"
									required
								/>
							</div>

							<button type="submit" className="contact-submit" disabled={status === "loading"}>
								{status === "loading" ? "Sending..." : "Send message"}
							</button>

							{status === "success" && <p className="form-status success">Thanks — your message has been saved.</p>}
							{status === "error" && <p className="form-status error">{error}</p>}
						</form>
					</article>

					<article className="contact-card contact-card-side">
						<h2 className="contact-heading">What to reach out about</h2>
						<ul className="contact-list">
							<li>Feedback on GoodBuys or feature ideas</li>
							<li>Partnerships with ethical brands or NGOs</li>
							<li>Questions about how we rate products and companies</li>
							<li>Anything else related to ethical shopping</li>
						</ul>

						<div className="contact-meta">
							<p className="contact-meta-label">We read every message.</p>
							<p className="contact-meta-footnote">
								We won&rsquo;t spam you or sell your info. Your email is only used so we can reply.
							</p>
						</div>
					</article>
				</section>
			</div>
		</main>
	);
}
