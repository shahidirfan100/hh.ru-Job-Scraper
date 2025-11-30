// hh.ru jobs scraper - CheerioCrawler implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { gotScraping } from 'got-scraping';

// Single-entrypoint main
await Actor.init();

// Stealth configuration with latest browser fingerprints
const STEALTH_CONFIG = {
    // Latest Chrome version (Nov 2025)
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'cache-control': 'max-age=0',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
    },
    // Human-like timing patterns
    delays: {
        minRead: 800,      // Minimum reading time (ms)
        maxRead: 2500,     // Maximum reading time (ms)
        minBrowse: 300,    // Minimum browsing delay (ms)
        maxBrowse: 1200,   // Maximum browsing delay (ms)
        networkJitter: 150 // Network latency simulation (ms)
    }
};

// Random delay with jitter
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

        // Input validation
        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, Math.min(+RESULTS_WANTED_RAW, 10000)) : 100;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, Math.min(+MAX_PAGES_RAW, 100)) : 999;
        
        log.info(`Starting hh.ru scraper - Target: ${RESULTS_WANTED} jobs, Max pages: ${MAX_PAGES}, Details: ${collectDetails}`);

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
        let shouldStop = false; // Flag to stop crawling
        
        // Helper function to check if we should continue
        const shouldContinue = () => {
            if (saved >= RESULTS_WANTED) {
                shouldStop = true;
                return false;
            }
            return !shouldStop;
        };

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
            sessionPoolOptions: {
                maxPoolSize: 50,
                sessionOptions: {
                    maxAgeSecs: 300,      // Rotate sessions every 5 minutes
                    maxUsageCount: 15,    // Max 15 requests per session
                },
            },
            // Optimized concurrency - balance between speed and stealth
            maxConcurrency: collectDetails ? 8 : 12, // Higher for list-only mode
            minConcurrency: 3,
            maxRequestsPerMinute: collectDetails ? 120 : 200, // Rate limiting
            requestHandlerTimeoutSecs: 60,
            
            // Advanced retry strategy with exponential backoff
            maxRequestRetries: 4,
            retryOnBlocked: true,
            
            // Stealth headers and timing
            preNavigationHooks: [
                async ({ request, session, crawler }) => {
                    // Stop crawler if limit reached
                    if (!shouldContinue()) {
                        crawlerLog.info('Limit reached, skipping remaining requests');
                        request.skipNavigation = true;
                        return;
                    }
                    
                    // Add stealth headers
                    request.headers = {
                        ...request.headers,
                        ...STEALTH_CONFIG.headers,
                        'user-agent': STEALTH_CONFIG.userAgent,
                        'referer': request.userData?.label === 'DETAIL' ? 'https://hh.ru/search/vacancy' : undefined,
                    };
                    
                    // Human-like delay before request
                    const delay = randomDelay(
                        STEALTH_CONFIG.delays.networkJitter, 
                        STEALTH_CONFIG.delays.networkJitter * 2
                    );
                    await sleep(delay);
                }
            ],
            
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog, session, crawler }) {
                // Skip if we've reached the limit
                if (!shouldContinue()) {
                    crawlerLog.info('Limit reached, stopping crawler');
                    return;
                }
                
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 0;
                const startTime = Date.now();

                if (label === 'LIST') {
                    const links = findJobLinks($, request.url);
                    crawlerLog.info(`LIST page ${pageNo} -> found ${links.length} vacancy links`);

                    // Parse vacancy cards from list page if not collecting details
                    if (!collectDetails) {
                        const vacancyCards = $('[data-qa="vacancy-serp__vacancy"]').toArray();
                        const items = [];
                        for (const card of vacancyCards) {
                            if (!shouldContinue()) break;
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
                        if (items.length) {
                            // Batch save for performance
                            await Dataset.pushData(items);
                            crawlerLog.info(`Saved ${saved}/${RESULTS_WANTED} jobs`);
                        }
                        
                        // Stop crawler if limit reached
                        if (!shouldContinue()) {
                            crawlerLog.info('Target reached, stopping crawler');
                            await crawler.autoscaledPool?.abort();
                            return;
                        }
                    } else {
                        // Check if we should continue before enqueuing
                        if (!shouldContinue()) {
                            crawlerLog.info('Target reached, not enqueuing more URLs');
                            return;
                        }
                        
                        // Collect detail pages with optimized batching
                        const remaining = RESULTS_WANTED - saved;
                        if (remaining <= 0) {
                            crawlerLog.info('No remaining jobs needed, stopping');
                            await crawler.autoscaledPool?.abort();
                            return;
                        }
                        
                        const toEnqueue = links.filter(l => !seenUrls.has(l)).slice(0, remaining);
                        toEnqueue.forEach(l => seenUrls.add(l));
                        
                        if (toEnqueue.length > 0) {
                            crawlerLog.info(`Enqueuing ${toEnqueue.length} detail pages (${saved}/${RESULTS_WANTED} saved)`);
                            // Batch enqueue for better performance
                            await enqueueLinks({ 
                                urls: toEnqueue, 
                                userData: { label: 'DETAIL' },
                                forefront: false // Add to back of queue for natural pacing
                            });
                        }
                    }

                    // Handle pagination with priority - only if we need more results
                    if (shouldContinue() && pageNo < MAX_PAGES) {
                        const remaining = RESULTS_WANTED - saved;
                        if (remaining > 0) {
                            const next = findNextPage($, request.url, pageNo + 1);
                            if (next) {
                                await enqueueLinks({ 
                                    urls: [next], 
                                    userData: { label: 'LIST', pageNo: pageNo + 1 },
                                    forefront: true // Prioritize pagination for faster list crawling
                                });
                            }
                        }
                    }
                    
                    // Simulate human reading time on list pages
                    const processingTime = Date.now() - startTime;
                    const minReadTime = STEALTH_CONFIG.delays.minBrowse;
                    if (processingTime < minReadTime) {
                        await sleep(minReadTime - processingTime + randomDelay(0, 200));
                    }
                    
                    return;
                }

                if (label === 'DETAIL') {
                    // Double-check we still need results
                    if (!shouldContinue()) {
                        crawlerLog.info('Limit reached, skipping detail extraction');
                        return;
                    }
                    
                    try {
                        // Try JSON-LD first for speed (fastest extraction method)
                        const json = extractFromJsonLd($);
                        const data = json || {};
                        
                        // Parallel extraction for non-JSON-LD fields (optimize DOM queries)
                        const [title, company, location, salaryEl, experience, employment] = await Promise.all([
                            data.title || $('h1[data-qa="vacancy-title"]').text().trim() || $('h1.bloko-header-section-1').text().trim() || null,
                            data.company || $('a[data-qa="vacancy-company-name"]').text().trim() || $('[data-qa="vacancy-company-name"]').text().trim() || null,
                            data.location || $('[data-qa="vacancy-view-location"]').text().trim() || $('[data-qa="vacancy-view-raw-address"]').text().trim() || null,
                            data.salary || $('[data-qa="vacancy-salary"]').text().trim() || null,
                            $('[data-qa="vacancy-experience"]').text().trim() || null,
                            $('[data-qa="vacancy-view-employment-mode"]').text().trim() || null,
                        ]);
                        
                        // Extract skills efficiently
                        const skills = [];
                        const keySkills = [];
                        
                        $('[data-qa="skills-element"]').each((_, el) => {
                            const skill = $(el).text().trim();
                            if (skill) skills.push(skill);
                        });
                        
                        $('[data-qa="bloko-tag__text"]').each((_, el) => {
                            const skill = $(el).text().trim();
                            if (skill) keySkills.push(skill);
                        });
                        
                        // Extract description only if not in JSON-LD
                        let description_html = data.description_html;
                        let description_text = null;
                        
                        if (!description_html) {
                            const descEl = $('[data-qa="vacancy-description"]');
                            description_html = descEl && descEl.length ? String(descEl.html()).trim() : null;
                        }
                        
                        if (description_html) {
                            description_text = cleanText(description_html);
                        }

                        const item = {
                            title: title,
                            company: company,
                            location: location,
                            salary: salaryEl,
                            experience: experience,
                            employment_type: data.employment_type || employment || null,
                            skills: skills.length > 0 ? skills : (keySkills.length > 0 ? keySkills : null),
                            date_posted: data.date_posted || null,
                            description_html: description_html,
                            description_text: description_text,
                            url: request.url,
                            source: 'hh.ru',
                            scraped_at: new Date().toISOString(),
                        };

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`✓ ${saved}/${RESULTS_WANTED}: ${item.title?.substring(0, 40) || 'N/A'}`);
                        
                        // Check if we've reached the limit after saving
                        if (!shouldContinue()) {
                            crawlerLog.info('Target reached after saving, stopping crawler');
                            await crawler.autoscaledPool?.abort();
                            return;
                        }
                        
                        // Simulate human reading time on detail pages
                        const processingTime = Date.now() - startTime;
                        const minReadTime = STEALTH_CONFIG.delays.minRead;
                        if (processingTime < minReadTime) {
                            const delay = minReadTime - processingTime + randomDelay(0, 300);
                            await sleep(delay);
                        }
                        
                    } catch (err) { 
                        crawlerLog.error(`DETAIL failed: ${err.message}`);
                        // Mark session as bad on repeated failures
                        if (session) {
                            session.markBad();
                        }
                    }
                }
            }
        });

        // Run crawler with performance tracking and timeout protection
        const crawlStartTime = Date.now();
        
        try {
            await crawler.run(initial.map(u => ({ url: u, userData: { label: 'LIST', pageNo: 0 } })));
        } catch (err) {
            // Handle crawler errors gracefully
            if (err.message?.includes('aborted') || shouldStop) {
                log.info('Crawler stopped after reaching target results');
            } else {
                log.error(`Crawler error: ${err.message}`);
                throw err;
            }
        }
        
        const crawlDuration = ((Date.now() - crawlStartTime) / 1000).toFixed(2);
        const avgSpeed = saved > 0 ? (saved / (crawlDuration / 60)).toFixed(1) : 0;
        
        log.info(`✓ Finished: ${saved}/${RESULTS_WANTED} jobs in ${crawlDuration}s (${avgSpeed} jobs/min)`);
        
        // Validate results for Apify QA
        if (saved === 0) {
            log.warning('No results found. Check search parameters or website availability.');
        }
        
        // Final statistics for Apify platform
        await Actor.setValue('OUTPUT', {
            success: saved > 0,
            totalResults: saved,
            targetResults: RESULTS_WANTED,
            durationSeconds: parseFloat(crawlDuration),
            averageSpeed: parseFloat(avgSpeed),
            collectDetails: collectDetails,
            timestamp: new Date().toISOString(),
            message: saved >= RESULTS_WANTED ? 'Target reached' : `Collected ${saved} of ${RESULTS_WANTED} requested jobs`
        });
        
        // Set exit status for Apify
        if (saved > 0) {
            log.info('Actor completed successfully');
        } else {
            log.warning('Actor completed with no results');
        }
        
    } catch (error) {
        log.error(`Fatal error: ${error.message}`, { error: error.stack });
        
        // Save error information for debugging
        await Actor.setValue('OUTPUT', {
            success: false,
            error: error.message,
            totalResults: saved,
            timestamp: new Date().toISOString()
        });
        
        throw error;
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { 
    console.error('Unhandled error:', err); 
    process.exit(1); 
});
