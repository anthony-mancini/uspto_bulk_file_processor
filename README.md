# USPTO Bulk Data Scraper and Synchronizer

## Introduction

This repository contains the code used to scrape, parse, and store all of the data in the bulk USPTO patent files into a MongoDB database. The code keeps track of which data has already been fetched and processed from the USPTO's bulk database repository by means of local caches, and only fetches and processes data that has not yet been processed.

## Usage

The `index.ts` file can be used as both a script and a module. If used as a script a `.env` will be read to get the connection string used to connect to the MongoDB database. The format of the `.env` file should be:

```
CONNECTION_STRING=<your_mongodb_connection_string>
```

After the connection string is set, the script can be built with the following command:

```
npm run build
```

And after it is built it can be run with the following command:

```
npm run sync
```

When used as a module, an exported `synchronize` function can be called to synchronzie all of the data. For more documentation on other functions that can be called and options they can take, please see the below documentation section.

## Documentation

Below is the documentation for all of the functions within this module:

## Documentation Table of contents

### Interfaces

- [UsptoPatentData](docs/interfaces/usptopatentdata.md)
- [UsptoPatentSchemaData](docs/interfaces/usptopatentschemadata.md)
- [UsptoZipFileInfo](docs/interfaces/usptozipfileinfo.md)

### Functions

- [fetchUsptoZipFileInfos](README.md#fetchusptozipfileinfos)
- [processCachedUsptoXmlData](README.md#processcachedusptoxmldata)
- [processCachedUsptoZipFiles](README.md#processcachedusptozipfiles)
- [processUsptoXmlFile](README.md#processusptoxmlfile)
- [synchronize](README.md#synchronize)
- [synchronizeProcessedDataToMongoDB](README.md#synchronizeprocesseddatatomongodb)
- [synchronizeUsptoZipFiles](README.md#synchronizeusptozipfiles)

## Functions

### fetchUsptoZipFileInfos

▸ **fetchUsptoZipFileInfos**(`fileLimit?`: *number*, `startYear?`: *number*, `endYear?`: *number*): *Promise*<[*UsptoZipFileInfo*](docs/interfaces/usptozipfileinfo.md)[]\>

Fetches a list of all the links for all of the bulk data fulltext USPTO patent files.

#### Parameters:

Name | Type | Default value | Description |
:------ | :------ | :------ | :------ |
`fileLimit` | *number* | 1 | a limiter on the number of URLs returned. Useful for testing small amounts of data.   |
`startYear` | *number* | 2005 | the start year for when patent data will be pulled.   |
`endYear` | *number* | - | the end year for when patent data will be pulled.   |

**Returns:** *Promise*<[*UsptoZipFileInfo*](docs/interfaces/usptozipfileinfo.md)[]\>

a list of all UsptoZipFileInfos created from fetching the links
from the USPTO's bulk data website.

Defined in: index.ts:88

___

### processCachedUsptoXmlData

▸ **processCachedUsptoXmlData**(`usptoXmlFileCacheDir?`: *string*, `usptoJsonFileCacheDir?`: *string*): *Promise*<void\>

Processing all of the bulk XML USPTO data files into a much smaller format
with only the data needed, and saves processed data in JSON formatted files.

#### Parameters:

Name | Type | Description |
:------ | :------ | :------ |
`usptoXmlFileCacheDir` | *string* | the cache directory for the XML files.   |
`usptoJsonFileCacheDir` | *string* | the cache directory for the processed JSON files.    |

**Returns:** *Promise*<void\>

Defined in: index.ts:336

___

### processCachedUsptoZipFiles

▸ **processCachedUsptoZipFiles**(`zipFileCacheDir?`: *string*, `processedZipFileCacheDir?`: *string*): *void*

Processes all of the bulk USPTO zip files by unzipping any of the files that
are missing in the processed zip file cache directory

#### Parameters:

Name | Type | Description |
:------ | :------ | :------ |
`zipFileCacheDir` | *string* | the cache directory where the zip files are stored.   |
`processedZipFileCacheDir` | *string* | the cache diretory where the unzipped contents are stored.    |

**Returns:** *void*

Defined in: index.ts:209

___

### processUsptoXmlFile

▸ **processUsptoXmlFile**(`bulkXmlFilePath`: *string*): *Promise*<[*UsptoPatentSchemaData*](docs/interfaces/usptopatentschemadata.md)[]\>

Processes a single bulk USPTO XML file by parsing out each of the individual
patents and converting them into an array of USPTO objects.

#### Parameters:

Name | Type | Description |
:------ | :------ | :------ |
`bulkXmlFilePath` | *string* | the file path of a bulk USPTO XML patent file.   |

**Returns:** *Promise*<[*UsptoPatentSchemaData*](docs/interfaces/usptopatentschemadata.md)[]\>

an array of all of the processed XML files in a JS object format.

Defined in: index.ts:240

___

### synchronize

▸ **synchronize**(): *Promise*<void\>

Single function to perform all of the synchronization

**Returns:** *Promise*<void\>

Defined in: index.ts:450

___

### synchronizeProcessedDataToMongoDB

▸ **synchronizeProcessedDataToMongoDB**(`connectionString?`: *string*, `processedJsonFileCacheDir?`: *string*, `synchronizeFilePath?`: *string*): *Promise*<void\>

Synchronizes all of the processed USPTO data into the MongoDB database.

#### Parameters:

Name | Type | Default value | Description |
:------ | :------ | :------ | :------ |
`connectionString` | *string* | null | the connection string of the live MongoDB database. Note that if no connection string is provided, a connection string will be read from the '.env' file in the 'CONNECTION_STRING' key.   |
`processedJsonFileCacheDir` | *string* | - | the cache directory with all of the JSON processed USPTO data files.   |
`synchronizeFilePath` | *string* | - | a path to the synchronization files used to keep track of which data has been pushed to the database.    |

**Returns:** *Promise*<void\>

Defined in: index.ts:363

___

### synchronizeUsptoZipFiles

▸ **synchronizeUsptoZipFiles**(`usptoZipFileInfos`: [*UsptoZipFileInfo*](docs/interfaces/usptozipfileinfo.md)[], `zipFileCacheDir?`: *string*): *Promise*<void\>

Synchronizes all of the USPTO patent bulk data zip files by scanning for
any missing files in a zip file cache directory, and fetching any of these
missing files.

#### Parameters:

Name | Type | Description |
:------ | :------ | :------ |
`usptoZipFileInfos` | [*UsptoZipFileInfo*](docs/interfaces/usptozipfileinfo.md)[] | zip file info objects that represent the URL and name of the bulk zip file.   |
`zipFileCacheDir` | *string* | the cache directory where the zip files will be stored.    |

**Returns:** *Promise*<void\>

Defined in: index.ts:162
