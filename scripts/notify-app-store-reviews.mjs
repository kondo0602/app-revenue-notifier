import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";
import {
	createAppStoreConnectJwt,
	postSlackMessage,
} from "./app-store-revenue.mjs";

const APPS = [
	{ id: "6544801645", name: "1人でウミガメのスープ" },
	{ id: "6836679773", name: "ノノプラネット" },
];
const APP_STORE_CONNECT = "https://api.appstoreconnect.apple.com";
const JST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function getReviewWindow(reportDate, now = new Date()) {
	const date =
		reportDate ||
		new Date(now.getTime() + JST_OFFSET - DAY).toISOString().slice(0, 10);
	const midnight = new Date(`${date}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		Number.isNaN(midnight.getTime()) ||
		midnight.toISOString().slice(0, 10) !== date
	) {
		throw new Error("REVIEW_DATE must be a valid date in YYYY-MM-DD format");
	}
	const start = midnight.getTime() - JST_OFFSET;
	return { date, start, end: start + DAY };
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
		for (const { attributes } of page.data) {
			const createdAt = Date.parse(attributes.createdDate);
			if (!Number.isFinite(createdAt)) {
				throw new Error(`Invalid review date returned for ${app.name}`);
			}
			if (createdAt < window.start) return reviews;
			if (createdAt < window.end) reviews.push(attributes);
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

function formatMessages(date, results) {
	const count = results.reduce(
		(total, { reviews }) => total + reviews.length,
		0,
	);
	const heading = `*App Storeレビュー | ${date}（日本時間） | ${count}件*`;
	const messages = [];
	let message = heading;
	for (const { app, reviews } of results) {
		const appHeading = `*${app.name} | ${reviews.length}件*`;
		if (reviews.length > 0) message += `\n\n${appHeading}`;
		for (const review of reviews) {
			const entry = `★${review.rating}/5（${slackText(review.territory, 12)}） ${slackText(review.title, 120)}\n${slackText(review.body, 500)}`;
			if (message.length + entry.length + 2 > 3500) {
				messages.push(message);
				message = `${heading}（続き）\n\n${appHeading}`;
			}
			message += `\n\n${entry}`;
		}
	}
	messages.push(message);
	return messages;
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
	for (const { app, reviews } of results) {
		console.log(`${window.date} ${app.name}: ${reviews.length} reviews`);
	}
	if (dryRun || results.every(({ reviews }) => reviews.length === 0)) return;
	for (const message of formatMessages(window.date, results)) {
		await postSlackMessage(env.SLACK_WEBHOOK_URL, message);
	}
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
