# hh.ru Jobs Scraper

<div align="center">

**Extract job vacancies from hh.ru - Russia's largest job search platform**

*Search by keywords, location, experience level, and schedule type with support for detailed scraping*

[![Apify](https://img.shields.io/badge/Apify-Actor-blue)](https://apify.com)
[![hh.ru](https://img.shields.io/badge/Data_Source-hh.ru-red)](https://hh.ru)

</div>

---

## 📋 Overview

This Apify actor scrapes job listings from **hh.ru**, Russia's leading employment website. Extract comprehensive job data including titles, companies, salaries, requirements, and full descriptions. Perfect for job market analysis, recruitment automation, and competitive intelligence.

### ✨ Key Features

- 🔍 **Advanced Search Filters** - Filter by keywords, location, experience, and work schedule
- 📄 **Detailed Job Extraction** - Get complete job descriptions and requirements
- ⚡ **Flexible Scraping Modes** - Choose between quick list view or detailed page extraction
- 📊 **Structured Data Output** - Clean JSON format ready for analysis
- 🛡️ **Anti-Blocking Protection** - Built-in proxy support for reliable scraping
- 🎯 **Pagination Support** - Automatically handles multiple result pages

---

## ⚙️ Input Configuration

Configure your job scraping with these input parameters:

### Search Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `text` | `string` | Job search keywords | `"Python Developer"` |
| `area` | `string` | Region code (1=Moscow, 2=St. Petersburg, 113=All Russia) | `"1"` |
| `experience` | `string` | Experience level: `noExperience`, `between1And3`, `between3And6`, `moreThan6` | `"between1And3"` |
| `schedule` | `string` | Work schedule: `remote`, `fullDay`, `shift`, `flexible` | `"remote"` |
| `employment` | `string` | Employment type: `full`, `part`, `project`, `probation` | `"full"` |

### Control Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `collectDetails` | `boolean` | `true` | Extract full job descriptions from detail pages |
| `results_wanted` | `number` | `100` | Maximum number of jobs to collect |
| `max_pages` | `number` | `20` | Maximum search result pages to crawl |
| `startUrl` | `string` | - | Custom hh.ru search URL (overrides other parameters) |
| `proxyConfiguration` | `object` | Residential proxy | Proxy settings for reliable access |

### 📝 Input Example

```json
{
  "text": "Python Developer",
  "area": "1",
  "experience": "between1And3",
  "schedule": "remote",
  "results_wanted": 50,
  "collectDetails": true
}
```

---

## 📤 Output Format

Each scraped job contains comprehensive data in this structure:

```json
{
  "title": "Senior Python Developer",
  "company": "Tech Innovations LLC",
  "location": "Moscow",
  "salary": "200 000-300 000 ₽",
  "experience": "3–6 years",
  "employment_type": "Full-time",
  "skills": ["Python", "Django", "PostgreSQL", "Docker"],
  "description_html": "<div>Full job description...</div>",
  "description_text": "Plain text version of the job description",
  "url": "https://hh.ru/vacancy/123456789",
  "date_posted": "2025-11-28T10:00:00Z",
  "source": "hh.ru",
  "scraped_at": "2025-11-30T14:23:45Z"
}
```

### Output Fields

- **`title`** - Job position name
- **`company`** - Hiring company name
- **`location`** - Job location or "Remote"
- **`salary`** - Salary range with currency
- **`experience`** - Required experience level
- **`employment_type`** - Full-time, part-time, etc.
- **`skills`** - Array of required skills
- **`description_html`** - Full HTML job description
- **`description_text`** - Plain text description
- **`url`** - Direct link to job posting
- **`date_posted`** - When the job was posted
- **`source`** - Data source identifier
- **`scraped_at`** - Timestamp of data collection

---

## 🚀 Usage Examples

### Example 1: Remote Python Jobs in Moscow

```json
{
  "text": "Python Developer",
  "area": "1",
  "schedule": "remote",
  "results_wanted": 100,
  "collectDetails": true
}
```

*Finds remote Python developer positions in Moscow with full descriptions.*

### Example 2: Junior Developer Positions Nationwide

```json
{
  "text": "Junior Developer",
  "area": "113",
  "experience": "noExperience",
  "results_wanted": 50
}
```

*Scrapes entry-level developer jobs across all Russian regions.*

### Example 3: Senior Level Tech Positions

```json
{
  "text": "Software Engineer",
  "area": "1",
  "experience": "between3And6",
  "employment": "full",
  "results_wanted": 30
}
```

*Extracts senior software engineering jobs in Moscow.*

### Example 4: Custom Search URL

```json
{
  "startUrl": "https://hh.ru/search/vacancy?text=Data+Scientist&area=2&experience=between1And3",
  "collectDetails": true,
  "results_wanted": 75
}
```

*Uses a custom hh.ru search URL for specific queries.*

---

## 💰 Cost & Limits

### Pricing

- **Free Tier**: 1,000 results per month
- **Personal Plan**: $5/month - 10,000 results
- **Team Plan**: $25/month - 50,000 results
- **Business Plan**: $99/month - 200,000 results

### Performance

- **Average Speed**: 50-100 jobs per minute
- **Recommended Max Results**: 1,000 jobs per run
- **Memory Usage**: ~512 MB
- **Proxy Required**: Yes (residential recommended)

### Rate Limits

- Respect hh.ru's terms of service
- Use appropriate delays between requests
- Consider using residential proxies for large-scale scraping

---

## 🆘 Troubleshooting

<details>
<summary><b>❌ No results returned</b></summary>

**Problem**: The scraper returns empty results.

**Solutions**:
- Check your search parameters - they might be too restrictive
- Try removing filters like `experience` or `schedule`
- Verify the `area` code is valid (1=Moscow, 2=St. Petersburg, 113=All Russia)
- Test with broader search terms

</details>

<details>
<summary><b>🐌 Scraper runs slowly</b></summary>

**Problem**: Scraping takes too long.

**Solutions**:
- Set `collectDetails: false` for faster results (skips detail pages)
- Reduce `results_wanted` to smaller batches
- Use residential proxies for better performance
- Lower `max_pages` if you don't need many results

</details>

<details>
<summary><b>🔒 Proxy errors or timeouts</b></summary>

**Problem**: Connection issues or blocking.

**Solutions**:
- Switch to residential proxies in proxy configuration
- Reduce concurrency if getting rate limited
- Add delays between requests
- Check proxy quota and upgrade if needed

</details>

<details>
<summary><b>📄 Incomplete job descriptions</b></summary>

**Problem**: Some jobs have minimal descriptions.

**Solutions**:
- Ensure `collectDetails: true` (default)
- Some jobs on hh.ru have limited descriptions by default
- This is normal behavior - not all jobs provide full details

</details>

---

## 📊 Common Area Codes

| Code | Region | Code | Region |
|------|--------|------|--------|
| `1` | Moscow | `66` | Nizhny Novgorod |
| `2` | Saint Petersburg | `88` | Kazan |
| `113` | All Russia | `54` | Yekaterinburg |
| `4` | Novosibirsk | `1001` | Other regions |

**Tip**: Use `113` for nationwide search or specific city codes for local results.

---

## 🎯 Use Cases

### Recruitment & Talent Acquisition
- Build talent pipelines for specific skills
- Monitor competitor job postings
- Identify hiring trends in your industry

### Market Research & Analysis
- Track in-demand skills and technologies
- Study regional employment patterns
- Analyze job posting trends

### Job Aggregation Platforms
- Power job search websites and apps
- Create specialized job boards
- Build job alert systems

### Career Intelligence
- Research companies hiring in your field
- Compare positions across organizations
- Discover emerging job categories

---

## 🔧 Best Practices

1. **Use Specific Keywords** - Targeted searches yield better results than broad queries
2. **Enable Proxies** - Essential for reliable, large-scale scraping
3. **Set Reasonable Limits** - Start with 50-100 results to test your configuration
4. **Schedule Regular Runs** - Jobs update frequently; automate scraping for fresh data
5. **Respect Rate Limits** - Use appropriate delays and proxy rotation
6. **Monitor Results** - Check output quality and adjust parameters as needed

---

## 📋 Changelog

### v1.0.0 (November 2025)
- ✅ Initial release
- ✅ Support for hh.ru job scraping
- ✅ Multiple search filters (experience, schedule, employment)
- ✅ Detailed job extraction with descriptions
- ✅ Flexible pagination and result limits
- ✅ Residential proxy support
- ✅ Comprehensive error handling

---

<div align="center">

**Ready to scrape hh.ru jobs?** 🚀

*Extract thousands of job listings with comprehensive data for your recruitment, research, or business needs.*

</div>
