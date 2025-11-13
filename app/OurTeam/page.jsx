"use client";

import { useEffect, useState } from "react";
import "../../styles/our-team.css";

export default function OurTeam() {
	const [teamData, setTeamData] = useState(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		fetch("/team/team.json")
			.then((res) => res.json())
			.then((data) => setTeamData(data))
			.catch((err) => {
				console.error("[OurTeam] Failed to load team.json", err);
				setError(true);
			});
	}, []);

	if (!teamData && !error) {
		return (
			<main id="our-team">
				<div className="our-team-inner our-team-loading">
					<div className="our-team-loading-shell">
						<div className="pill-skeleton" />
						<div className="title-skeleton" />
						<div className="lede-skeleton" />
						<div className="card-row-skeleton">
							<div className="card-skeleton" />
							<div className="card-skeleton" />
							<div className="card-skeleton" />
						</div>
					</div>
				</div>
			</main>
		);
	}

	if (error && !teamData) {
		return (
			<main id="our-team">
				<div className="our-team-inner our-team-loading">
					<div className="our-team-error">
						<h2>Couldn’t load the team right now.</h2>
						<p>Refresh the page or check back in a bit — the humans are still here, promise.</p>
					</div>
				</div>
			</main>
		);
	}

	const { currentTeamMembers = [], pastTeamMembers = [] } = teamData;
	const currentCount = currentTeamMembers.length || 0;
	const pastCount = pastTeamMembers.length || 0;

	return (
		<main id="our-team">
			<div className="our-team-inner">
				<section className="our-team-hero">
					<div className="our-team-hero-header">
						<p className="our-team-pill">The People Behind GoodBuys</p>

						<h1 className="our-team-title">
							Humans building
							<br />a more ethical marketplace.
						</h1>

						<p className="our-team-lede">
							Engineers, researchers, and product folks turning noisy label data into something normal people can trust at
							a glance.
						</p>
					</div>

					<div className="our-team-meta">
						<div className="meta-pill">
							<span className="meta-dot live" />
							<span className="meta-label">
								{currentCount} active {currentCount === 1 ? "member" : "members"}
							</span>
						</div>

						{pastCount > 0 && (
							<div className="meta-pill">
								<span className="meta-dot" />
								<span className="meta-label">
									{pastCount} {pastCount === 1 ? "alumni" : "alumni"}
								</span>
							</div>
						)}

						<div className="meta-pill subtle">
							<span className="meta-label">Student-led, research-driven, eco-obsessed.</span>
						</div>
					</div>
				</section>

				<section className="our-team-section">
					<header className="our-team-section-header">
						<h2>Current Team</h2>
						<p>Actively building and shipping GoodBuys right now.</p>
					</header>

					<div className="our-team-grid">
						{currentTeamMembers.map((member, idx) => (
							<article className="team-card current" key={member.name} style={{ "--card-index": idx }} data-team-card>
								<div className="team-card-header">
									<div className="team-avatar-wrap">
										<div className="team-avatar-orbit" />
										<img
											src={`/images/team/${member.image}`}
											alt={member.name}
											className="team-avatar"
											loading="lazy"
										/>
									</div>

									<div className="team-identity">
										<h3 className="team-name">{member.name}</h3>
										{member.role && <p className="team-role">{member.role}</p>}
										{member.degree && <p className="team-degree">{member.degree}</p>}
									</div>

									<span className="team-status-badge team-status-current">Current</span>
								</div>

								{member.bio && <p className="team-bio">{member.bio}</p>}

								<div className="team-footer">
									{member.focus && (
										<ul className="team-tags">
											{member.focus.map((tag) => (
												<li className="team-tag" key={`${member.name}-${tag}`}>
													{tag}
												</li>
											))}
										</ul>
									)}

									{member.linkedIn && (
										<a href={member.linkedIn} target="_blank" rel="noreferrer" className="team-linkedin">
											View LinkedIn
											<span className="team-linkedin-arrow">↗</span>
										</a>
									)}
								</div>
							</article>
						))}
					</div>
				</section>

				{pastTeamMembers.length > 0 && (
					<section className="our-team-section alumni-section">
						<header className="our-team-section-header">
							<h2>Past Contributors</h2>
							<p>Alumni who helped shape GoodBuys and carried the mission forward.</p>
						</header>

						<div className="our-team-grid alumni-grid">
							{pastTeamMembers.map((member, idx) => (
								<article
									className="team-card past"
									key={`past-${member.name}`}
									style={{ "--card-index": idx }}
									data-team-card
								>
									<div className="team-card-header compact">
										<div className="team-avatar-wrap small">
											<div className="team-avatar-orbit" />
											<img
												src={`/images/team/resizedTeam/${member.image}`}
												alt={member.name}
												className="team-avatar"
												loading="lazy"
											/>
										</div>

										<div className="team-identity">
											<h3 className="team-name">{member.name}</h3>
											{member.role && <p className="team-role">{member.role}</p>}
											{member.degree && <p className="team-degree">{member.degree}</p>}
										</div>

										<span className="team-status-badge team-status-alumni">Alumni</span>
									</div>

									<div className="team-footer subtle">
										{member.linkedIn && (
											<a
												href={member.linkedIn}
												target="_blank"
												rel="noreferrer"
												className="team-linkedin subtle"
											>
												LinkedIn
												<span className="team-linkedin-arrow">↗</span>
											</a>
										)}
									</div>
								</article>
							))}
						</div>
					</section>
				)}
			</div>
		</main>
	);
}
