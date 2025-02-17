// 収入レポート
class RevenueReport {
	constructor() {
		this.totalEarnings = 0;
		this.entries = [];
	}

	addEntry(revenueData) {
		this.entries.push(revenueData);
		this.totalEarnings += revenueData.earnings;
	}
}

// 各アプリの収入
class RevenueData {
	constructor(platform, appName, earnings) {
		this.platform = platform;
		this.appName = appName;
		this.earnings = earnings;
	}
}
