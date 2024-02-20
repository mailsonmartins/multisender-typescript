import fs from 'fs';

const readFile = (filePath: string) => {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const addresses = JSON.parse(data);
        return addresses;
    } catch (error) {
        console.error('Error reading file:', error);
        return null;
    }
};

const addresses = readFile('./holders.json');
var arrayAddresses = new Array();
addresses.forEach((address:string,i:number) => {
    arrayAddresses.push({
        'walletAddress': address,
        'numLamports': 1
    });
});

export interface Drop{
    walletAddress:string,
    numLamports:number
}

export const dropList:Drop[] = arrayAddresses;