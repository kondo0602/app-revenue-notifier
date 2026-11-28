import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { loadReviewState } from "./app-store-review-state.mjs";
import {
	fetchReviews,
	getReviewWindow,
	notifyUnpostedReviews,
} from "./notify-app-store-reviews.mjs";

const app = { id: "123", name: "Test App" };

test("includes the last three completed days in JST across paginated results", async () => {
	const window = getReviewWindow("", new Date("2026-12-01T00:17:00Z"));
	assert.equal(window.label, "2026-11-28〜2026-11-30");
	assert.equal(
		getReviewWindow("2026-11-29").start,
		Date.parse("2026-11-28T15:00:00Z"),
	);
	const row = (id, createdDate) => ({ id, attributes: { createdDate } });
	const pages = [
		{
			data: [
				row("today", "2026-12-01T00:00:00+09:00"),
				row("yesterday", "2026-11-30T23:59:59+09:00"),
			],
			links: { next: "/v1/apps/123/customerReviews?cursor=next" },
		},
		{
			data: [
				row("late", "2026-11-28T00:00:00+09:00"),
				row("too-old", "2026-11-27T23:59:59+09:00"),
			],
		},
	];
	const reviews = await fetchReviews(app, window, "token", async () =>
		Response.json(pages.shift()),
	);
	assert.deepEqual(
		reviews.map(({ id, date }) => [id, date]),
		[
			["123:yesterday", "2026-11-30"],
			["123:late", "2026-11-28"],
		],
	);
});

test("records only successful Slack messages and suppresses duplicates on retry", async () => {
	const saved = new Set(["123:posted"]);
	const state = {
		postedIds: saved,
		prepare: async () => {},
		save: async (ids) => {
			for (const id of ids) saved.add(id);
		},
	};
	const review = (id) => ({
		id: `123:${id}`,
		body: "<".repeat(500),
		date: "2026-11-28",
		rating: 5,
	});
	const pending = ["first", "second", "third"].map(review);
	const input = {
		label: "2026-11-28〜2026-11-30",
		results: [{ app, reviews: [review("posted"), ...pending, pending[0]] }],
		state,
	};
	await notifyUnpostedReviews({ ...input, dryRun: true, post: assert.fail });
	assert.equal(saved.size, 1);
	let posts = 0;
	await assert.rejects(
		notifyUnpostedReviews({
			...input,
			post: async () => {
				if (++posts === 2) throw new Error("Slack error");
			},
		}),
		/Slack error/,
	);
	assert.deepEqual([...saved], ["123:posted", "123:first"]);
	await notifyUnpostedReviews({
		...input,
		post: async () => {
			posts++;
		},
	});
	assert.deepEqual(
		[...saved],
		["123:posted", "123:first", "123:second", "123:third"],
	);
	await notifyUnpostedReviews({ ...input, post: assert.fail });
	assert.equal(posts, 4);
});

test("initializes the state branch and uses the returned file SHA for updates", async () => {
	const methods = [];
	const state = await loadReviewState(
		{
			GITHUB_API_URL: "https://api.github.com",
			GITHUB_REPOSITORY: "test/test",
			GITHUB_TOKEN: "token",
			GITHUB_SHA: "source-sha",
		},
		async (url, { method, body }) => {
			methods.push(method);
			if (method === "GET") return new Response(null, { status: 404 });
			const payload = JSON.parse(body);
			if (method === "POST") {
				assert.equal(payload.ref, "refs/heads/chore/app-store-review-state");
				assert.equal(payload.sha, "source-sha");
				return Response.json({}, { status: 201 });
			}
			assert.match(url, /\/contents\//);
			const ids = JSON.parse(
				Buffer.from(payload.content, "base64").toString("utf8"),
			);
			if (!payload.sha) assert.deepEqual(ids, []);
			else {
				assert.equal(payload.sha, "file-sha");
				assert.deepEqual(ids, ["123:new"]);
			}
			return Response.json({ content: { sha: "file-sha" } });
		},
	);
	await state.prepare();
	await state.save(["123:new"]);
	assert.deepEqual(methods, ["GET", "GET", "POST", "PUT", "PUT"]);
});
