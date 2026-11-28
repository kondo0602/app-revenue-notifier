import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";
import {
	createAppStoreConnectJwt,
	postSlackMessage,
} from "./app-store-revenue.mjs";
import { loadReviewState } from "./app-store-review-state.mjs";

const APPS = [
	{ id: "6544801645", name: "1人でウミガメのスープ" },
	{ id: "6836679773", name: "ノノプラネット" },
];
const APP_STORE_CONNECT = "https://api.appstoreconnect.apple.com";
const JST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 3;

function jstDate(timestamp) {
	return new Date(timestamp + JST_OFFSET).toISOString().slice(0, 10);
}

export function getReviewWindow(reportDate, now = new Date()) {
	const date = reportDate || jstDate(now.getTime() - DAY);
	const midnight = new Date(`${date}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		Number.isNaN(midnight.getTime()) ||
		midnight.toISOString().slice(0, 10) !== date
	) {
		throw new Error("REVIEW_DATE must be a valid date in YYYY-MM-DD format");
	}
	const end = midnight.getTime() - JST_OFFSET + DAY;
	const start = end - (reportDate ? 1 : LOOKBACK_DAYS) * DAY;
	const firstDate = jstDate(start);
	const label = firstDate === date ? date : `${firstDate}〜${date}`;
	return { label, start, end };
}

export async function fetchReviews(app, window, token, fetchImpl = fetch) {
	const url = new URL(`/v1/apps/${app.id}/customerReviews`, APP_STORE_CONNECT);
	url.searchParams.set("sort", "-createdDate");
	url.searchParams.set("limit", "200");
	url.searchParams.set(
		"fields[customerReviews]",
		"rating,title,body,createdDate,territory",
	);
	const reviews = [];
	let next = url.href;

	while (next) {
		const pageUrl = new URL(next, APP_STORE_CONNECT);
		if (
			pageUrl.origin !== APP_STORE_CONNECT ||
			pageUrl.pathname !== url.pathname
		) {
			throw new Error(`Invalid review pagination link for ${app.name}`);
		}
		const response = await fetchImpl(pageUrl, {
			headers: { Authorization: `Bearer ${token}` },
			redirect: "error",
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) {
			throw new Error(
				`App Store Connect review request failed for ${app.name} (HTTP ${response.status})`,
			);
		}
		const page = await response.json();
		for (const { id, attributes } of page.data) {
			const createdAt = Date.parse(attributes.createdDate);
			if (!Number.isFinite(createdAt)) {
				throw new Error(`Invalid review date returned for ${app.name}`);
			}
			if (createdAt < window.start) return reviews;
			if (createdAt < window.end) {
				if (typeof id !== "string" || !id) {
					throw new Error(`Missing review ID for ${app.name}`);
				}
				reviews.push({
					...attributes,
					id: `${app.id}:${id}`,
					date: jstDate(createdAt),
				});
			}
		}
		next = page.links?.next;
	}
	return reviews;
}

function slackText(value, limit) {
	const text = value ?? "";
	const shortened = text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
	return shortened
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function formatMessages(label, results) {
	const count = results.reduce(
		(total, { reviews }) => total + reviews.length,
		0,
	);
	const heading = `*App Storeレビュー | ${label}（日本時間） | 未通知${count}件*`;
	const messages = [];
	let message = { text: heading, ids: [] };
	for (const { app, reviews } of results) {
		const appHeading = `\n\n*${app.name} | ${reviews.length}件*`;
		let section = appHeading;
		for (const review of reviews) {
			const entry = `\n\n${review.date} ★${review.rating}/5（${slackText(review.territory, 12)}） ${slackText(review.title, 120)}\n${slackText(review.body, 500)}`;
			if (
				message.text.length + section.length + entry.length > 3500 &&
				message.ids.length
			) {
				messages.push(message);
				message = { text: `${heading}（続き）`, ids: [] };
				section = appHeading;
			}
			message.text += section + entry;
			message.ids.push(review.id);
			section = "";
		}
	}
	if (message.ids.length) messages.push(message);
	return messages;
}

export async function notifyUnpostedReviews({
	label,
	results,
	state,
	dryRun,
	post,
}) {
	const seen = new Set(state.postedIds);
	const pending = results.map(({ app, reviews }) => {
		const unposted = reviews.filter(({ id }) => {
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		});
		console.log(
			`${label} ${app.name}: ${reviews.length} reviews, ${unposted.length} unposted`,
		);
		return { app, reviews: unposted };
	});
	if (dryRun) return;
	const messages = formatMessages(label, pending);
	if (!messages.length) return;
	await state.prepare();
	for (const { text, ids } of messages) {
		await post(text);
		await state.save(ids);
	}
}

async function main(env) {
	const window = getReviewWindow(env.REVIEW_DATE);
	const dryRun = env.DRY_RUN === "true";
	const required = [
		"APPSTORE_ISSUER_ID",
		"APPSTORE_KEY_ID",
		"APPSTORE_PRIVATE_KEY_BASE64",
	];
	if (!dryRun) required.push("SLACK_WEBHOOK_URL");
	const missing = required.filter((name) => !env[name]);
	if (missing.length)
		throw new Error(`Missing environment variables: ${missing.join(", ")}`);

	const token = await createAppStoreConnectJwt({
		issuerId: env.APPSTORE_ISSUER_ID,
		keyId: env.APPSTORE_KEY_ID,
		privateKey: Buffer.from(env.APPSTORE_PRIVATE_KEY_BASE64, "base64").toString(
			"utf8",
		),
	});
	const results = await Promise.all(
		APPS.map(async (app) => ({
			app,
			reviews: await fetchReviews(app, window, token),
		})),
	);
	await notifyUnpostedReviews({
		label: window.label,
		results,
		state: await loadReviewState(env),
		dryRun,
		post: (message) => postSlackMessage(env.SLACK_WEBHOOK_URL, message),
	});
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	try {
		await main(process.env);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
