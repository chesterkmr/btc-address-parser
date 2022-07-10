const fs = require("fs");
const setTitle = require("node-bash-title");
const { ECPairFactory } = require("ecpair");
const bitcoin = require("bitcoinjs-lib");
const tinysecp = require("tiny-secp256k1");
const { default: axios } = require("axios");
const ECPair = ECPairFactory(tinysecp);

let balanceFound = 0;
let walletsParsed = 0;

function getBalances(addresses) {
  return new Promise((resolve, reject) =>
    axios
      .get("https://blockchain.info/balance", {
        params: {
          active: addresses.join("|"),
        },
      })
      .then((res) =>
        resolve(
          Object.entries(res.data).map((entry) => ({
            address: entry[0],
            ...entry[1],
          }))
        )
      )
  );
}

function generatePair() {
  const keyPair = ECPair.makeRandom();
  const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });
  const publicKey = keyPair.publicKey.toString("hex");
  const privateKey = keyPair.toWIF();
  return { address, privateKey, publicKey };
}

function generatePairs(quantity) {
  return [
    ...new Array(quantity).fill(null).map(() => generatePair()),
    // {
    //   address: "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX",
    //   privateKey: "test private",
    //   publicKey: "test public",
    // },
  ];
}

function delay(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function checkBalancesAndWriteResult(balances, addresses) {
  const addressesMap = addresses.reduce((accum, addressEntity) => {
    accum[addressEntity.address] = addressEntity;
    return accum;
  }, {});
  const balancesWithValue = balances.filter((balance) =>
    Boolean(balance.final_balance)
  );

  if (balancesWithValue.length) {
    console.log(`Found BTC balance`, JSON.stringify(balancesWithValue));
    console.log("Writing results...");
    await new Promise((resolve, reject) => {
      const promises = [];

      balancesWithValue.forEach((balance) => {
        promises.push(
          new Promise((resolve, reject) => {
            const entity = addressesMap[balance.address];
            const text = `\n${entity.address}|${entity.privateKey}|${entity.publicKey}`;

            if (!fs.existsSync("./results.txt")) {
              console.log("Creating results file.");
              fs.writeFileSync("./results.txt", "");
              console.log("File created.");
            }

            fs.appendFile("./results.txt", text, (err) =>
              err ? reject(err) : resolve()
            );
          })
        );
      });

      Promise.all(promises).then(resolve).catch(reject);
    });
  }

  return balancesWithValue;
}

const PAIRS_PER_ITERATION = 100;

function updateTitle(walletsParsed, balanceFound) {
  setTitle(
    `Wallets parsed: ${walletsParsed}. Balance found ${balanceFound} BTC`
  );
}

async function init() {
  while (true) {
    console.log("Generating pairs");
    const pairs = generatePairs(PAIRS_PER_ITERATION);
    const addresses = pairs.map((pair) => pair.address);
    console.log("Getting balances");
    const balances = await getBalances(addresses);
    const result = await checkBalancesAndWriteResult(balances, pairs);
    walletsParsed += pairs.length;
    balanceFound += result.reduce(
      (total, result) => (total += result.final_balance / 100000000),
      balanceFound
    );
    updateTitle(walletsParsed, balanceFound);

    const interval = randomIntFromInterval(5000, 10000);
    console.log(`Sleeping for ${interval}ms.`);
    await delay(interval);
  }
}

init();
