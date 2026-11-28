import { Buffer } from "node:buffer";

const BRANCH = "chore/app-store-review-state";
const FILE = "app-store-posted-review-ids.json";

export async function loadReviewState(
	{ GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_SHA },
	fetchImpl = fetch,
) {
	if (!GITHUB_API_URL || !GITHUB_REPOSITORY || !GITHUB_TOKEN || !GITHUB_SHA) {
		throw new Error(
			"GitHub Actions configuration is required to read review history",
		);
	}
	const base = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}`;
	const fileUrl = `${base}/contents/${FILE}`;
	const request = async (url, method = "GET", payload = undefined) => {
		const response = await fetchImpl(url, {
			method,
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${GITHUB_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
			redirect: "error",
			signal: AbortSignal.timeout(20_000),
		});
		if (!response.ok && !(method === "GET" && response.status === 404)) {
			throw new Error(
				`GitHub review history request failed (${method}, HTTP ${response.status})`,
			);
		}
		return response;
	};
	const file = await request(`${fileUrl}?ref=${encodeURIComponent(BRANCH)}`);
	let sha;
	let ids = [];
	if (file.ok) {
		const result = await file.json();
		sha = result.sha;
		ids = JSON.parse(Buffer.from(result.content, "base64").toString("utf8"));
		if (
			!sha ||
			!Array.isArray(ids) ||
			ids.some((id) => typeof id !== "string" || !id)
		) {
			throw new Error("Invalid GitHub review history");
		}
	}
	const postedIds = new Set(ids);
	async function save(reviewIds) {
		const nextIds = new Set([...postedIds, ...reviewIds]);
		const response = await request(fileUrl, "PUT", {
			branch: BRANCH,
			message: "chore: App Storeレビューの通知履歴を更新",
			content: Buffer.from(`${JSON.stringify([...nextIds])}\n`).toString(
				"base64",
			),
			sha,
		});
		sha = (await response.json()).content.sha;
		for (const id of reviewIds) postedIds.add(id);
	}

	return {
		postedIds,
		async prepare() {
			if (sha) return;
			const ref = await request(`${base}/git/ref/heads/${BRANCH}`);
			if (!ref.ok) {
				await request(`${base}/git/refs`, "POST", {
					ref: `refs/heads/${BRANCH}`,
					sha: GITHUB_SHA,
				});
			}
			await save([]);
		},
		save,
	};
}
