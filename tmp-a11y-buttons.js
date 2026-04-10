JSON.stringify(Array.from(document.querySelectorAll('button')).map(b => ({ ariaLabel: b.getAttribute('aria-label'), title: b.title, text: b.textContent.trim().slice(0,20) })))
