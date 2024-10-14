const { log } = require('console');
const puppeteer = require('puppeteer');
const urlLib = require('url');
const { readFileSync, writeFileSync, existsSync, appendFileSync, link } = require('fs');
const { parse } = require('json2csv'); 

const MAX_PAGES = 100;

// Extracts links from a page, filtering for internal links
async function extractLinks(page, baseURL) {
  // await page.waitForSelector('a');  // Wait for links to appear
  const links = await page.$$eval('a', anchors => anchors.map(a => a.getAttribute('href')));
  // log('row links', links);
  const filteredLinks = links.filter(link => 
    typeof link === 'string' &&         
    link !== '/' &&                       
    !link.includes('static-files') &&     
    !link.includes('.xml') &&
    !link.includes('.xlsx') &&
    !link.includes('#') &&     
    !link.includes('asPDF=') &&  
    !link.includes('pdf')   &&                
    !link.startsWith('javascript:') &&    
    !link.startsWith('tel:') &&           
    !link.startsWith('mailto:')   &&                  
    (link.startsWith(baseURL) || link.startsWith('/')) 
  );
    // log('filtered links', filteredLinks);
  return filteredLinks;
}

// Groups URLs by their subdirectory
function groupUrl(url) {
  const parsedUrl = urlLib.parse(url);
  const path = parsedUrl.pathname.split('/').filter(Boolean); 
  const basePath = `${path[0]}`; 

  if (!groupedUrls[basePath]) {
    groupedUrls[basePath] = [];
  }
  
  groupedUrls[basePath].push(url);
}

// Crawls a page and visits links recursively
async function crawl(browser, page, url, baseURL) {
  if (visitedUrls.size >= MAX_PAGES || visitedUrls.has(url)) {
    return;
  }
  console.log(`Crawling: ${url}`);
  visitedUrls.add(url);
  groupUrl(url);

  try {
    // const browser = await puppeteer.launch();

    const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
    await page.goto(url, { waitUntil: 'load' });
    // acceptCookiesFromPopup(page, '#hs-eu-cookie-confirmation', '#hs-eu-confirmation-button')
  const pageLinks = await extractLinks(page, baseURL); // extract main page links

    const frames = page.frames();
  for (const frame of frames) {
    const frameLinks = await extractLinks(frame, baseURL); 
    pageLinks.push(...frameLinks ); 
  }
  await page.close()

    log('page links:', pageLinks);
    for (let link of pageLinks) {
      const resolvedLink = link.startsWith('/') ? urlLib.resolve(baseURL, link) : link;
      // log('link', resolvedLink);

      if (!visitedUrls.has(resolvedLink)) {
          await crawl(browser, page, resolvedLink, baseURL);
        }
    }
  } catch (error) {
    console.log(`Failed to crawl ${url}:`, error);
    throw error; // Rethrow the error to log it later
  }
}

// Function to generate CSV from grouped URLs
function generateCSV(baseURL) {
  const csvData = Object.entries(groupedUrls).map(([key, urls]) => ({
    subdirectory: key,
    count: urls.length,
    urls: urls.join('; '),
  }));

  const csv = parse(csvData, { header: true });

  // Create the file name based on the base URL
  const baseDomain = urlLib.parse(baseURL).hostname
    .replace(/\.[^/.]+$/, '').replace(/\./g, '_');
  
  const fileName = `${baseDomain}-grouped_sitemap.csv`;

  // Check if the file already exists
  if (existsSync(fileName)) {
    console.log(`File "${fileName}" already exists, overwriting with new data.`);
  } else {
    console.log(`Creating new file: ${fileName}`);
  }

  writeFileSync(fileName, csv); // Write the grouped CSV data to a file
}

// Logs the URL to a file for monitoring
function logUrl(url, filePath) {
  appendFileSync(filePath, `${url}\n`);
}

(async () => {

const urls = readFileSync('urls.txt', 'utf-8')
  .split('\n') 
  .filter(Boolean); // Remove empty lines
  const failureLog = 'failed_urls.log';
  const successLog = 'successful_urls.log';

  const browser = await puppeteer.launch();

  for (const homepageURL of urls) {
    try {
      visitedUrls = new Set();
      groupedUrls = {};

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');

      await crawl(browser, page, homepageURL, homepageURL);
      generateCSV(homepageURL); 
      logUrl(homepageURL, successLog); 
    } catch (error) {
      logUrl(homepageURL, failureLog);
    }
  }
  
  await browser.close();
})();
