/**
 * @file This file contains all of the code used to fetch, process, and 
 * synchronize all of the bulk data from the Redbook fulltext section on the 
 * United States Patent Office (USPTO) bulk data website. The data is fetched,
 * synchronized locally with a cache, processes all of the fetched data by
 * unzipping the files and parsing the XML data to JSON data, and then pushes
 * all of the data to a MongoDB database.
 * 
 * @author Anthony Mancini
 * @version 1.0.0
 * @license AGPLv3
 */

import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosResponse } from 'axios';
import * as AdmZip from 'adm-zip';
import { Parser as XmlParser } from 'xml2js';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();


/**
 * A generic interface used to represent information on the Zip files that are
 * fetched from the USPTO's bulk data website.
 */
export interface UsptoZipFileInfo {
  name: string,
  url: string,
}


/**
 * An interface to represent processed USPTO patent data from the XML files.
 */
export interface UsptoPatentData {
  language: string,
  country: string,
  dateProduced: string,
  datePublished: string,
  dtdVersion: string,
  xmlFile: string,
  patentStatus: string,
  patentAbstract: string[],
  patentClaims: {
    genericClaim: string, 
    individualClaims: string[],
  }[],
  patentHeadings: string[],
  inventionTitle: string,
  inventionId: string,
  documentNumber: string,
}


/**
 * Represents the MongoDB Schema form of the processed XML USPTO data.
 */
export interface UsptoPatentSchemaData {
  language: string,
  country: string,
  dateProduced: string,
  datePublished: string,
  dtdVersion: string,
  xmlFile: string,
  patentStatus: string,
  patentAbstract: string,
  patentClaims: string,
  patentHeadings: string,
  inventionTitle: string,
  inventionId: string,
  documentNumber: string,
}


/**
 * Fetches a list of all the links for all of the bulk data fulltext USPTO patent files.
 * 
 * @param fileLimit a limiter on the number of URLs returned. Useful for 
 * testing small amounts of data.
 * @param startYear the start year for when patent data will be pulled.
 * @param endYear the end year for when patent data will be pulled.
 * @returns a list of all UsptoZipFileInfos created from fetching the links 
 * from the USPTO's bulk data website.
 */
export async function fetchUsptoZipFileInfos(
  fileLimit: number = 1,  
  startYear: number = 2005, 
  endYear: number = new Date().getFullYear(),  
) : Promise<UsptoZipFileInfo[]> {

  // Creating an array of all promises when fetching the USPTO data (NOTE: there 
  // is actually a bug with the USPTO's bulk data website that does generates
  // a bugged page if too many requests are performed at once, so I've had to
  // limit the requests into a single request at a time)
  //let usptoYearResponsePromises: Promise<AxiosResponse>[] = [];
  let usptoYearResponsePromises: AxiosResponse[] = [];

  // For each year starting with the startYear and ending at the endYear, 
  // fetching the link page for that year, and adding the fetch to the promise
  // array
  for (let year = startYear; year <= endYear; year++) {
    let usptoBulkDataYearUrl: string = `https://bulkdata.uspto.gov/data/patent/application/redbook/fulltext/${year}/`;
    //let usptoYearResponse: Promise<AxiosResponse> = axios.get(usptoBulkDataYearUrl);
    let usptoYearResponse: AxiosResponse = await axios.get(usptoBulkDataYearUrl);

    // Displaying a message to the user that the page was fetched
    console.log(`Successfully fetched ${usptoBulkDataYearUrl}.`)

    usptoYearResponsePromises.push(usptoYearResponse);
  }

  // Resolving all of the promises
  let usptoYearResolvedPromises: AxiosResponse[] = await Promise.all(usptoYearResponsePromises);
  
  // Creating an array of USPTO zip file details, including the name of the
  // file and the url
  let usptoZipFileInfos: UsptoZipFileInfo[] = [];

  // Parsing out all of the urls for the zip files and creating and adding the
  // info for each file to the zip file list
  usptoYearResolvedPromises.forEach(usptoYearResponse => {
    // Getting the url and the HTML contents of the fetched page
    let usptoBulkDataYearUrl: string = usptoYearResponse.config.url;
    let htmlPageContents: string = usptoYearResponse.data;

    // Using a Regular Expression to parse out all of the links in the fetched
    // HTML content
    let linkRegularExpression: RegExp = /a\shref[=]["][a-zA-Z]{1,5}[0-9]{1,11}[.]zip["][>]/gmis;
    let usptoBulkDataLinks: string[] = htmlPageContents.match(linkRegularExpression)
      .map((linkText: string) => linkText.split('"')[1].split('"')[0]);

    // Creating a UsptoZipFileInfo for each of the 
    usptoBulkDataLinks.forEach(ipaZipFileName => {
      usptoZipFileInfos.push({
        name: ipaZipFileName,
        url: usptoBulkDataYearUrl + ipaZipFileName,
      });
    });
  });

  // Limiting the number of zip file infos returned
  usptoZipFileInfos = usptoZipFileInfos.slice(0, fileLimit);

  // Returning the uspto zip file infos
  return usptoZipFileInfos;
}


/**
 * Synchronizes all of the USPTO patent bulk data zip files by scanning for
 * any missing files in a zip file cache directory, and fetching any of these
 * missing files.
 * 
 * @param usptoZipFileInfos zip file info objects that represent the URL and
 * name of the bulk zip file.
 * @param zipFileCacheDir the cache directory where the zip files will be 
 * stored.
 */
export async function synchronizeUsptoZipFiles(
    usptoZipFileInfos: UsptoZipFileInfo[],
    zipFileCacheDir: string = path.join(__dirname, 'uspto_zip_file_cache'),
) : Promise<void> {
  // Creating a directory to synchronize all of the USPTO zip files if the 
  // directory does not already exist
  if (!fs.existsSync(zipFileCacheDir)) {
    fs.mkdirSync(zipFileCacheDir);
  }

  // Getting a list of all file names in the synchronization directory
  let cachedZipFilePaths: string[] = fs.readdirSync(zipFileCacheDir);

  // For each of the USPTO zip infos, checking if the name of the zip file
  // exists in the cache dir, and if it doesn't fetch the zip file and add it
  // to the cache directory
  for (let usptoZipFileInfo of usptoZipFileInfos) {
    if (!cachedZipFilePaths.includes(usptoZipFileInfo.name)) {
      // Displaying information to the user to let them know which file is
      // currently being fetched
      console.log(`Fetching USPTO file at: ${usptoZipFileInfo.url}`);

      // Fetching only a single file at a time. The sizes of the files are very
      // large, generally anywhere from 100 MB to 500 MB. It may be possible to
      // parallelize this for 3-4 files at a time, but it runs the risk of the
      // process failing due to RAM usage. For now, only a single file is fetched
      // at a time
      let usptoZipFileName: string = usptoZipFileInfo.name;
      let usptoZipFileResponse: AxiosResponse = await axios.get(usptoZipFileInfo.url, {
        responseType: 'arraybuffer',
      });

      let usptoZipFileCachePath: string = path.join(zipFileCacheDir, usptoZipFileName)
      fs.writeFileSync(usptoZipFileCachePath, usptoZipFileResponse.data)
    }
  }
}


/**
 * Processes all of the bulk USPTO zip files by unzipping any of the files that
 * are missing in the processed zip file cache directory 
 * 
 * @param zipFileCacheDir the cache directory where the zip files are stored.
 * @param processedZipFileCacheDir the cache diretory where the unzipped 
 * contents are stored.
 */
export function processCachedUsptoZipFiles(
  zipFileCacheDir: string = path.join(__dirname, 'uspto_zip_file_cache'),
  processedZipFileCacheDir: string = path.join(__dirname, 'uspto_xml_file_cache'),
) : void {
  // Creating a directory to synchronize all of the processed USPTO zip files 
  // if the directory does not already exist
  if (!fs.existsSync(processedZipFileCacheDir)) {
    fs.mkdirSync(processedZipFileCacheDir);
  }

  // Getting a list of all file names in the synchronization directory
  let cachedZipFilePaths: string[] = fs.readdirSync(zipFileCacheDir)
    .map((zipFileName: string) => path.join(zipFileCacheDir, zipFileName));

  // Unzipping the file into the XML file if the file does not already exist
  // in the processed zip file directory
  for (let cachedZipFilePath of cachedZipFilePaths) {
    let usptoZipFile: any = new AdmZip(cachedZipFilePath);

    usptoZipFile.extractAllTo(processedZipFileCacheDir);
  }  
}


/**
 * Processes a single bulk USPTO XML file by parsing out each of the individual
 * patents and converting them into an array of USPTO objects.
 * 
 * @param bulkXmlFilePath the file path of a bulk USPTO XML patent file.
 * @returns an array of all of the processed XML files in a JS object format.
 */
export async function processUsptoXmlFile(
  bulkXmlFilePath: string,
) : Promise<UsptoPatentSchemaData[]> {
  // Reading the bulk XML file, and parsing out all of the patents
  let xmlData = fs.readFileSync(bulkXmlFilePath).toString();
  let patentXmlSectionRegularExpression: RegExp = /[<]us-patent-application\s.*?[<][/]us-patent-application[>]/gmis; 
  let patentXmlSections: string[] = xmlData.match(patentXmlSectionRegularExpression);

  // Creating an array of all the patent data in the bulk XML file
  let usptoBulkPatentData: UsptoPatentSchemaData[] = [];

  // For each patent section, creating an XML to JavaScript Object parser and
  // parsing the data into a UsptoPatentData structure. After the structure is
  // created, it is added to an array of all the UsptoPatentData
  for (let patentXmlSection of patentXmlSections) {
    let xmlParser: XmlParser = new XmlParser();
    let parsedPatentData: any = await xmlParser.parseStringPromise(patentXmlSection);

    // Creating the UsptoPatentData structure from the 
    let processedPatentData: UsptoPatentData = {
      // The language the patent was filed in
      language: parsedPatentData['us-patent-application']['$']['lang'],

      // The country of the filer
      country: parsedPatentData['us-patent-application']['$']['country'],

      // The date the patent was produced
      dateProduced: parsedPatentData['us-patent-application']['$']['date-produced'],

      // the date the patent was published
      datePublished: parsedPatentData['us-patent-application']['$']['date-publ'],

      // A version number for the type of patent
      dtdVersion: parsedPatentData['us-patent-application']['$']['dtd-version'],

      // The name of the associated XML file where the patent XML data 
      // resides
      xmlFile: parsedPatentData['us-patent-application']['$']['file'],

      // The status of the patent
      patentStatus: parsedPatentData['us-patent-application']['$']['status'],

      // An abstract text for the patent
      patentAbstract: parsedPatentData['us-patent-application']['abstract'][0]['p']
        .map(abstract => {
          return abstract['_']
        }),

      // A listing of the generic claim of the patent as well as the 
      // individual claims
      patentClaims: parsedPatentData['us-patent-application']['claims'][0]['claim']
        .map(claim => {
          return claim['claim-text'][0]
        })
        .map(claim => {
          return {
            genericClaim: claim['_'],
            individualClaims: claim['claim-text'],
          }
        }),

      // All of the headings in the patent text
      patentHeadings: parsedPatentData['us-patent-application']['description'][0]['heading'].map(heading => heading['_']),

      // The formal title of the invention prescribed in the patent
      inventionTitle: parsedPatentData['us-patent-application']['us-bibliographic-data-application'][0]['invention-title'][0]['_'],

      // The ID of the invention of the patent
      inventionId: parsedPatentData['us-patent-application']['us-bibliographic-data-application'][0]['invention-title'][0]['$']['id'],

      // The document number for this patent
      documentNumber: parsedPatentData['us-patent-application']['us-bibliographic-data-application'][0]['publication-reference'][0]['document-id'][0]['doc-number'][0],
    };

    // Converting the complex data structures into JSON strings
    let processedPatentSchemaData: UsptoPatentSchemaData = {
      ...processedPatentData,
      patentAbstract: JSON.stringify(processedPatentData.patentAbstract),
      patentClaims: JSON.stringify(processedPatentData.patentClaims),
      patentHeadings: JSON.stringify(processedPatentData.patentHeadings),
    };

    usptoBulkPatentData.push(processedPatentSchemaData);
  }
  
  return usptoBulkPatentData;
}

/**
 * Processing all of the bulk XML USPTO data files into a much smaller format 
 * with only the data needed, and saves processed data in JSON formatted files.
 * 
 * @param usptoXmlFileCacheDir the cache directory for the XML files.
 * @param usptoJsonFileCacheDir the cache directory for the processed JSON 
 * files.
 */
export async function processCachedUsptoXmlData(
  usptoXmlFileCacheDir: string = path.join(__dirname, 'uspto_xml_file_cache'),
  usptoJsonFileCacheDir: string = path.join(__dirname, 'uspto_json_file_cache'),
) : Promise<void> {
  let usptoXmlFilePaths: string[] = fs.readdirSync(usptoXmlFileCacheDir)
    .map((fileName: string) => path.join(usptoXmlFileCacheDir, fileName));

  for (let usptoXmlFilePath of usptoXmlFilePaths) {
    let usptoSchemaData: UsptoPatentSchemaData[] = await processUsptoXmlFile(usptoXmlFilePath);
    let usptoJsonSchemaDataFilePath = path.join(usptoJsonFileCacheDir, usptoXmlFilePath.split(".")[0] + '.json');

    fs.writeFileSync(usptoJsonSchemaDataFilePath, JSON.stringify(usptoSchemaData));
  }
}


/**
 * Synchronizes all of the processed USPTO data into the MongoDB database.
 * 
 * @param connectionString the connection string of the live MongoDB database.
 * Note that if no connection string is provided, a connection string will be
 * read from the '.env' file in the 'CONNECTION_STRING' key.
 * @param processedJsonFileCacheDir the cache directory with all of the JSON
 * processed USPTO data files.
 * @param synchronizeFilePath a path to the synchronization files used to keep
 * track of which data has been pushed to the database.
 */
export async function synchronizeProcessedDataToMongoDB(
  connectionString: string = null,
  processedJsonFileCacheDir: string = path.join(__dirname, 'uspto_json_file_cache'),
  synchronizeFilePath: string = path.join(__dirname, 'sync.json')
) : Promise<void> {
  // Getting the connection string from the environment file if no connection
  // string was provided
  if (connectionString === null) {
    connectionString = process.env.CONNECTION_STRING;
  }

  // Creating a synchronize file containing all of the files that have already 
  // been pushed to the database, or reading the existing cache file if one 
  // already exists
  let synchronizedFileNames: string[] = [];

  if (fs.existsSync(synchronizeFilePath)) {
    synchronizedFileNames = JSON.parse(fs.readFileSync(synchronizeFilePath).toString());
  } else {
    fs.writeFileSync(synchronizeFilePath, '[]');
  }
  
  // Getting all of the file names in the processed XML cache directory
  let processedJsonCachedFiles: string[] = fs.readdirSync(processedJsonFileCacheDir)
    .filter((fileName: string) => !synchronizedFileNames.includes(fileName));

  // Connecting to the database and creating a connection object
  let connection = await mongoose.createConnection(connectionString);

  // Creating a database Schema used to represent the processed data, and 
  // creating a model from this Schema
  let UsptoDataSchema = new mongoose.Schema({
    language: String,
    country: String,
    dateProduced: String,
    datePublished: String,
    dtdVersion: String,
    xmlFile: String,
    patentStatus: String,
    patentAbstract: String,
    patentClaims: String,
    patentHeadings: String,
    inventionTitle: String,
    inventionId: String,
    documentNumber: String,
  });

  let UsptoData = connection.model('UsptoData', UsptoDataSchema);

  // Adding all of the data to the MongoDB database
  for (let processedJsonCachedFile of processedJsonCachedFiles) {
    // Reading all the files that have not yet been synchronized
    let processedXmlCachedPath: string = path.join(processedJsonFileCacheDir, processedJsonCachedFile);

    // Getting all of the schema data from the file that has not yet been
    // synchronized
    let processedXmlUsptoSchemaDataArray: UsptoPatentSchemaData[] = JSON.parse(fs.readFileSync(processedXmlCachedPath).toString());

    // Adding all of the unsynchronized data to the MongoDB database
    for (let processedUsptoSchemaData of processedXmlUsptoSchemaDataArray) {
      // Creating a new UsptoData object for our MongoDB database
      let usptoData = new UsptoData({
        language: processedUsptoSchemaData.language,
        country: processedUsptoSchemaData.country,
        dateProduced: processedUsptoSchemaData.dateProduced,
        datePublished: processedUsptoSchemaData.datePublished,
        dtdVersion: processedUsptoSchemaData.dtdVersion,
        xmlFile: processedUsptoSchemaData.xmlFile,
        patentStatus: processedUsptoSchemaData.patentStatus,
        patentAbstract: JSON.stringify(processedUsptoSchemaData.patentAbstract),
        patentClaims: JSON.stringify(processedUsptoSchemaData.patentClaims),
        patentHeadings: JSON.stringify(processedUsptoSchemaData.patentHeadings),
        inventionTitle: processedUsptoSchemaData.inventionTitle,
        inventionId: processedUsptoSchemaData.inventionId,
        documentNumber: processedUsptoSchemaData.documentNumber,
      });

      // Saving the object to the database
      await usptoData.save();
    }
  }
}


/**
 * Single function to perform all of the synchronization
 */
export async function synchronize() {
  // Fetching the links to all of the zip file infos
  let usptoZipFileInfos: UsptoZipFileInfo[] = await fetchUsptoZipFileInfos();

  // Synchronizing the zip files, and fetching any missing files
  await synchronizeUsptoZipFiles(usptoZipFileInfos);

  // Processing any missing files in the process cache directory
  await processCachedUsptoZipFiles();

  // Processing any missing unzipped XML files from the processed cache
  // directory
  await processCachedUsptoXmlData();

  // Synchronizing all of the cached data with the MongoDB database
  await synchronizeProcessedDataToMongoDB();
}


/*
 * Running the code when this file is used as a script as opposed to a module
 */
if (require.main === module) {
  (async () => {
    
    await synchronize();
  })();
}