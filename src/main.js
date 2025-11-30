// hh.ru jobs scraper - CheerioCrawler implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

// Single-entrypoint main
await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            text = '', area = '1', experience = '', schedule = '', employment = '',
            results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 999, 
            collectDetails = true, 
            startUrl, startUrls, url, 
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 999;

        const toAbs = (href, base = 'https://hh.ru') => {
            try { return new URL(href, base).href; } catch { return null; }
        };

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        const buildStartUrl = (params) => {
            const u = new URL('https://hh.ru/search/vacancy');
            if (params.text) u.searchParams.set('text', String(params.text).trim());
            if (params.area) u.searchParams.set('area', String(params.area));
            if (params.experience) u.searchParams.set('experience', String(params.experience));
            if (params.schedule) u.searchParams.set('schedule', String(params.schedule));
            if (params.employment) u.searchParams.set('employment', String(params.employment));
            u.searchParams.set('hhtmFrom', 'vacancy_search_list');
            return u.href;
        };

        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl({ text, area, experience, schedule, employment }));

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenUrls = new Set();

        function extractFromJsonLd($) {
            const scripts = $('script[type="application/ld+json"]');
            for (let i = 0; i < scripts.length; i++) {
                try {
                    const parsed = JSON.parse($(scripts[i]).html() || '');
                    const arr = Array.isArray(parsed) ? parsed : [parsed];
                    for (const e of arr) {
                        if (!e) continue;
                        const t = e['@type'] || e.type;
                        if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) {
                            return {
                                title: e.title || e.name || null,
                                company: e.hiringOrganization?.name || null,
                                date_posted: e.datePosted || null,
                                description_html: e.description || null,
                                location: (e.jobLocation && e.jobLocation.address && (e.jobLocation.address.addressLocality || e.jobLocation.address.addressRegion)) || null,
                                salary: e.baseSalary?.value?.value || e.baseSalary?.minValue || null,
                                salary_currency: e.baseSalary?.currency || null,
                                employment_type: e.employmentType || null,
                            };
                        }
                    }
                } catch (e) { /* ignore parsing errors */ }
            }
            return null;
        }

        function findJobLinks($, base) {
            const links = new Set();
            // hh.ru uses specific selectors for vacancy cards
            $('a[data-qa="serp-item__title"], a.bloko-link[href*="/vacancy/"]').each((_, a) => {
                const href = $(a).attr('href');
                if (!href) return;
                const abs = toAbs(href, base);
                if (abs && /hh\.ru\/vacancy\/\d+/i.test(abs)) {
                    // Remove query parameters for cleaner URLs
                    const cleanUrl = abs.split('?')[0];
                    links.add(cleanUrl);
                }
            });
            return [...links];
        }

        function findNextPage($, base, currentPage) {
            // hh.ru pagination: look for pager elements
            const nextLink = $('a[data-qa="pager-next"]').attr('href');
            if (nextLink) return toAbs(nextLink, base);
            
            // Alternative: construct next page URL
            const pagerPages = $('a[data-qa="pager-page"]');
            if (pagerPages.length > 0) {
                const maxPage = Math.max(...pagerPages.map((_, el) => parseInt($(el).text()) || 0).get());
                if (currentPage < maxPage) {
                    const urlObj = new URL(base);
                    urlObj.searchParams.set('page', String(currentPage));
                    return urlObj.href;
                }
            }
            return null;
        }

        function parseVacancyCard($, card) {
            const $card = $(card);
            const titleEl = $card.find('a[data-qa="serp-item__title"]');
            const title = titleEl.text().trim() || null;
            const url = titleEl.attr('href') ? toAbs(titleEl.attr('href')) : null;
            
            const company = $card.find('[data-qa="vacancy-serp__vacancy-employer"]').text().trim() || null;
            const location = $card.find('[data-qa="vacancy-serp__vacancy-address"]').text().trim() || null;
            
            const salaryEl = $card.find('[data-qa="vacancy-serp__vacancy-compensation"]');
            const salary = salaryEl.text().trim() || null;
            
            const snippetEl = $card.find('[data-qa="vacancy-serp__vacancy_snippet_requirement"], [data-qa="vacancy-serp__vacancy_snippet_responsibility"]');
            const snippet = snippetEl.text().trim() || null;

            return { title, company, location, salary, snippet, url };
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 90,
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 0;

                if (label === 'LIST') {
                    const links = findJobLinks($, request.url);
                    crawlerLog.info(`LIST page ${pageNo} (${request.url}) -> found ${links.length} vacancy links`);

                    // Parse vacancy cards from list page if not collecting details
                    if (!collectDetails) {
                        const vacancyCards = $('[data-qa="vacancy-serp__vacancy"]').toArray();
                        const items = [];
                        for (const card of vacancyCards) {
                            if (saved >= RESULTS_WANTED) break;
                            const data = parseVacancyCard($, card);
                            if (data.url && !seenUrls.has(data.url)) {
                                seenUrls.add(data.url);
                                items.push({
                                    ...data,
                                    source: 'hh.ru',
                                    scraped_at: new Date().toISOString(),
                                });
                                saved++;
                            }
                        }
                        if (items.length) await Dataset.pushData(items);
                    } else {
                        // Collect detail pages
                        const remaining = RESULTS_WANTED - saved;
                        const toEnqueue = links.filter(l => !seenUrls.has(l)).slice(0, Math.max(0, remaining));
                        toEnqueue.forEach(l => seenUrls.add(l));
                        if (toEnqueue.length) {
                            await enqueueLinks({ urls: toEnqueue, userData: { label: 'DETAIL' } });
                        }
                    }

                    // Handle pagination
                    if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const next = findNextPage($, request.url, pageNo + 1);
                        if (next) {
                            await enqueueLinks({ urls: [next], userData: { label: 'LIST', pageNo: pageNo + 1 } });
                        }
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) return;
                    try {
                        const json = extractFromJsonLd($);
                        const data = json || {};
                        
                        // Extract vacancy details using hh.ru selectors
                        if (!data.title) {
                            data.title = $('h1[data-qa="vacancy-title"]').text().trim() || 
                                        $('h1.bloko-header-section-1').text().trim() || null;
                        }
                        
                        if (!data.company) {
                            data.company = $('a[data-qa="vacancy-company-name"]').text().trim() || 
                                         $('[data-qa="vacancy-company-name"]').text().trim() || null;
                        }
                        
                        if (!data.location) {
                            data.location = $('[data-qa="vacancy-view-location"]').text().trim() || 
                                           $('[data-qa="vacancy-view-raw-address"]').text().trim() || null;
                        }
                        
                        if (!data.salary) {
                            const salaryEl = $('[data-qa="vacancy-salary"]');
                            data.salary = salaryEl.text().trim() || null;
                        }
                        
                        // Extract experience
                        const experience = $('[data-qa="vacancy-experience"]').text().trim() || null;
                        
                        // Extract employment type
                        const employment = $('[data-qa="vacancy-view-employment-mode"]').text().trim() || null;
                        
                        // Extract skills
                        const skills = [];
                        $('[data-qa="skills-element"]').each((_, el) => {
                            const skill = $(el).text().trim();
                            if (skill) skills.push(skill);
                        });
                        
                        // Extract description
                        if (!data.description_html) {
                            const descEl = $('[data-qa="vacancy-description"]');
                            data.description_html = descEl && descEl.length ? String(descEl.html()).trim() : null;
                        }
                        data.description_text = data.description_html ? cleanText(data.description_html) : null;
                        
                        // Extract key skills from description section
                        const keySkills = [];
                        $('[data-qa="bloko-tag__text"]').each((_, el) => {
                            const skill = $(el).text().trim();
                            if (skill) keySkills.push(skill);
                        });

                        const item = {
                            title: data.title || null,
                            company: data.company || null,
                            location: data.location || null,
                            salary: data.salary || null,
                            experience: experience,
                            employment_type: data.employment_type || employment || null,
                            skills: skills.length > 0 ? skills : (keySkills.length > 0 ? keySkills : null),
                            date_posted: data.date_posted || null,
                            description_html: data.description_html || null,
                            description_text: data.description_text || null,
                            url: request.url,
                            source: 'hh.ru',
                            scraped_at: new Date().toISOString(),
                        };

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`Saved ${saved}/${RESULTS_WANTED}: ${item.title} - ${item.company}`);
                    } catch (err) { 
                        crawlerLog.error(`DETAIL ${request.url} failed: ${err.message}`); 
                    }
                }
            }
        });

        await crawler.run(initial.map(u => ({ url: u, userData: { label: 'LIST', pageNo: 0 } })));
        log.info(`Finished. Saved ${saved} items from hh.ru`);
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
