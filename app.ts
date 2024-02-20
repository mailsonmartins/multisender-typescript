import { getOrCreateAssociatedTokenAccount, createTransferInstruction} from "@solana/spl-token";
import { Connection, Keypair, ParsedAccountData, PublicKey, sendAndConfirmTransaction, Transaction} from "@solana/web3.js";
import { decode } from "bs58";
import {Drop,dropList} from "./dropList";
import * as dotenv from "dotenv";
dotenv.config();

const privateKey = process.env.PRIVATE_KEY!;

const SOLANA_RPC = process.env.SOLANA_RPC!;
let SOLANA_CONNECTION = new Connection(SOLANA_RPC);

const MINT_ADDRESS = process.env.TOKEN_ADDRESS!;
const TRANSFER_AMOUNT = 1;

const NUM_DROPS_PER_TX = 10;
const TX_INTERVAL = 1000;

const FROM_KEY_PAIR = Keypair.fromSecretKey(new Uint8Array(decode(privateKey)));

async function getNumberDecimals(mintAddress: string):Promise<number> {
    const info = await SOLANA_CONNECTION.getParsedAccountInfo(new PublicKey(mintAddress));
    const result = (info.value?.data as ParsedAccountData).parsed.info.decimals as number;
    return result;
}

async function sendTokens() {
    console.log(`Enviando ${TRANSFER_AMOUNT} ${(MINT_ADDRESS)} de ${(FROM_KEY_PAIR.publicKey.toString())}.`)

    var arrayAddresses = new Array();
    for(let cont = 0; cont < dropList.length; cont++){
        arrayAddresses.push(dropList[cont]);
        if((cont+1) % 100 == 0 || (cont + 1) == dropList.length){
            SOLANA_CONNECTION = new Connection(SOLANA_RPC);
            var transactionList = await generateTransactions(NUM_DROPS_PER_TX,arrayAddresses,FROM_KEY_PAIR.publicKey,(cont+1));
            const txResults = await executeTransactions(SOLANA_CONNECTION,transactionList,FROM_KEY_PAIR);
            console.log(txResults);
            arrayAddresses = new Array();
        }
    }
}

async function generateTransactions(batchSize:number, arrayAddresses:Drop[], fromWallet:PublicKey, quant:number):Promise<Transaction[]>{
    
    let result: Transaction[] = [];

    //Step 1
    console.log(`1 - Buscando conta vinculada ao token`);
    let sourceAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        FROM_KEY_PAIR,
        new PublicKey(MINT_ADDRESS),
        FROM_KEY_PAIR.publicKey
    );
    console.log(`    Conta: ${sourceAccount.address.toString()}`);

    //Step 2
    console.log(`2 - Buscando o número de decimais do token: ${MINT_ADDRESS}`);
    const numberDecimals = await getNumberDecimals(MINT_ADDRESS);
    console.log(`    Número de decimais: ${numberDecimals}`);

    let txInstructions = new Array();

    //Step 3
    console.log(`3 - Buscando contas dos destinatários`);

    for(let cont = 0; cont < arrayAddresses.length; cont++){        
        await getOrCreateAssociatedTokenAccount(
            SOLANA_CONNECTION, 
            FROM_KEY_PAIR,
            new PublicKey(MINT_ADDRESS),
            new PublicKey(arrayAddresses[cont].walletAddress)
        ).then(destinationAccount => createTransferInstruction(
            sourceAccount.address,
            destinationAccount.address,
            FROM_KEY_PAIR.publicKey,
            TRANSFER_AMOUNT * Math.pow(10, numberDecimals)
        )).then(instruct => txInstructions.push(instruct))
        .catch(error => console.log(`Conta ${arrayAddresses[cont].walletAddress} não encontrada`));

    }

    console.log(`4 - Quantidade de destinatários: ${arrayAddresses.length}/${quant}`);

    const numTransactions = Math.ceil(txInstructions.length / batchSize);
    for(let i = 0; i < numTransactions; i++){
        let bulkTransaction = new Transaction();
        let lowerIndex = i * batchSize;
        let upperIndex = (i + 1) * batchSize;
        for(let j = lowerIndex; j < upperIndex; j++){
            if(txInstructions[j]) bulkTransaction.add(txInstructions[j]);
        }
        
        result.push(bulkTransaction);
    }
    
    return result;

}

async function executeTransactions(solanaConnection:Connection, transactionList:Transaction[], payer:Keypair):Promise<PromiseSettledResult<string>[]> {
    let result:PromiseSettledResult<string>[] = [];

    console.log(`5 - Criando e enviando as transações:`);

    let staggeredTransactions:Promise<string>[] = transactionList.map((transaction, i,allTx) => {
        return (new Promise((resolve) => {
            setTimeout(() => {
                console.log(`Requisitando transação ${i+1}/${allTx.length}`);
                solanaConnection.getLatestBlockhash()
                    .then(recentHash=>transaction.recentBlockhash = recentHash.blockhash)
                    .then(()=>sendAndConfirmTransaction(solanaConnection,transaction,[payer]))
                    .then(resolve);
            }, i * TX_INTERVAL);
        }));
    });

    result = await Promise.allSettled(staggeredTransactions);
    return result;

}

sendTokens();