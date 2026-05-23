document.addEventListener('DOMContentLoaded', () => {
	const links = document.querySelectorAll('.action-link');
	links.forEach(link => {
		link.addEventListener('click', (e) => {
			e.preventDefault();
			const url = link.getAttribute('href');
			if (url) {
				chrome.tabs.create({ url });
			}
		});
	});
});
