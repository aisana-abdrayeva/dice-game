const crypto = require("node:crypto");
const readline = require("readline-sync"); 
const Table = require('cli-table3');
const chalk = require('chalk');

class Menu {
    static async promptSelection(message, options, diceList) {
        let indexes = [];
        console.log(message);
        options.forEach((option, index) => {
            console.log(`${index} - ${option}`);
            indexes.push(index.toString());
        });
        console.log("X - exit");
        console.log("? - help");

        return await Menu.readInput("Your selection: ", indexes.concat('X', '?'), diceList); 
    }

    static async readInput(prompt, options, diceList) {
        do{
            const answer = readline.question(prompt).trim();
            if(!options.includes(answer)){
                console.log("Please, select from the options provided.")
            } else {
                if(answer === '?'){
                    try{
                        TableGenerator.generate(diceList);
                        continue;
                    } catch(e) {
                        console.error("Error:", e.message);
                        return;
                    }
                }
                else if (answer === 'X') process.exit(1);
                else return Number(answer);
            };
        } while(1);
    }
}

class Dice {
    constructor(values) {
        this.values = values;
    }
    get getValues(){
        return this.values;
    }

    get numberOfFaces(){
        return this.values.length;
    }

    roll(index) {
        return this.values[index];
    }
    toString() {
        return `[${this.values.join(",")}]`;
    }
}

class DiceConfigParser {
    constructor(argv){
        this.argv = argv.slice(2);
        if (this.argv.length < 3) {
            throw new Error("You must provide at least 3 dice configurations.");
        }
        this.diceConfig = this.argv.map((str) => {
            const parts = str.split(",").map(Number);
            if (parts.length < 2 || parts.some(isNaN)) {
                throw new Error(`Invalid dice configuration: "${str}". Expected comma-separated numbers.`);
            }
            return parts;
        }) 
    }
    getRawDiceConfig(){
        return this.diceConfig;
    }
    getDiceConfig(){
        return this.diceConfig.map(cfg => new Dice(cfg));
    }
}

class TableGenerator {
    static generate(diceList){
        if(!diceList){
            throw new Error("No dice data available to display probability table.");
        }
        const headers = ['VS \\ Dice'].concat(diceList.map((die, i) => `${die}`));
        const table = new Table({
            head: headers,
            colWidths: new Array(headers.length).fill((diceList.length + 1)**2),
        });
        for (let i = 0; i < diceList.length; i++) {
            const row = [chalk.red(diceList[i].toString())];
            for (let j = 0; j < diceList.length; j++) {
                let prob = ProbabilityCalculator.computeWinProbability(diceList[i], diceList[j]).toFixed(3);
                if(i != j){
                    prob = chalk.blue(prob);
                }
                row.push(prob);
            }
            table.push(row);
        }
        console.log(table.toString());
    }
}

class ProbabilityCalculator {
    static computeWinProbability(userDice, computerDice) {
        const wins = userDice.flatMap(x => computerDice.map(y => x > y)).filter(Boolean).length;
        const total = userDice.length * computerDice.length;
        return wins/total;
    }
}

class RandomGenerator {
    static rand(range){
        return crypto.randomInt(0, range);
    }
    static key(){
        return require("node:crypto").randomBytes(32);
    }
    static printKey(key){
        console.log(`(KEY=${key.toString('hex').toUpperCase()}).`);
    }
}

class HmacCalculator {
    static calcHmac(num, key) {
        return crypto.createHmac("sha3-256", key).update(Buffer.from([num])).digest("hex");
    }
    static printHmac(hmac){
        console.log(`(HMAC=${hmac.toUpperCase()}).`);
    }
}

class Protocol {
    constructor(range){
        this.range = range;
        this.key = null;
        this.computerNum = null;
        this.hmac = null;
        this.userFirst = false;
    }

    get computerNumber(){
        return this.computerNum;
    }

    get isUserFirst (){
        return this.userFirst;
    }

    set isUserFirst(bool){
        this.userFirst = bool;
    }

    generateKey() {
        this.key = RandomGenerator.key();
    }

    generateRandomIndex(max) {
        this.computerNum = RandomGenerator.rand(max);
    }

    computeHmac() {
        this.hmac = HmacCalculator.calcHmac(this.computerNum, this.key);
    }

    start() {
        this.generateKey();
        this.generateRandomIndex(this.range);
        this.computeHmac();
        HmacCalculator.printHmac(this.hmac);
    }

    reveal() {
        console.log(`My selection: ${this.computerNum}`);
        RandomGenerator.printKey(this.key);
    }
}

class DiceSelection {
    constructor(dice, protocol){
        this.dice = dice;
        this.protocol = protocol;
        this.computerDice = null;
        this.userDice = null;
    }
    get getUserDice(){
        return this.userDice;
    }
    get getComputerDice(){
        return this.computerDice;
    }

    async start(diceList){
        console.log(`Let's determine who makes the first move.\nI selected a random value in the range 0..1`);
        this.protocol.start();
        do{
            let userGuess = await Menu.promptSelection("Try to guess my selection.", [0, 1], diceList);
            if (userGuess === this.protocol.computerNumber) this.protocol.isUserFirst = true;
            this.protocol.reveal();
            break;
        } while (1)
        if(this.protocol.isUserFirst){
            let index = await Menu.promptSelection("You make the first move. Choose your dice:", this.dice, diceList);
            this.userDice = this.dice[index];
            console.log(`You chose the ${this.userDice} dice.`);
            this.dice.splice(index, 1);
            this.computerDice = this.dice[RandomGenerator.rand(this.dice.length)];
            console.log(`I choose the ${this.computerDice} dice.`);
        }
        else{
            let index = RandomGenerator.rand(this.dice.length);
            this.computerDice = this.dice[index];
            console.log(`I make the first move and choose the ${this.computerDice} dice.`);
            this.dice.splice(index, 1); 
            this.userDice = this.dice[await Menu.promptSelection("Choose your dice:", this.dice, diceList)];
            console.log(`You chose the ${this.userDice} dice.`);
        }
    }
}

class DiceRoller {
    constructor(whose, protocol, userDice, computerDice){
        this.whose = whose;
        this.protocol = protocol;
        this.userDice = userDice;
        this.computerDice = computerDice;
    }
    isUserDice(whose){
        if(whose === "My") return false;
        else return true;
    }
    result(user, computer){
        if(user > computer) console.log(`You win (${user} > ${computer})!`);
        else if (user === computer) console.log(`It's draw (${user} = ${computer})!`);
        else console.log(`I win (${user} < ${computer})!`);
    }
    async start(diceList) {
        console.log(`It's time for ${this.whose.toLowerCase()} roll.\nI selected a random value in the range 0..5`);
        this.protocol.start();
        let userSelection = await Menu.promptSelection(`Add your number modulo 6.`, [0, 1, 2, 3, 4, 5], diceList);
        this.protocol.reveal();
        let result = (this.protocol.computerNumber + Number(userSelection)) % 6;
        console.log(`The fair number generation result is ${this.protocol.computerNumber} + ${userSelection} = ${result} (mod 6).`);
        result = this.isUserDice(this.whose) ? this.userDice.roll(result) : this.computerDice.roll(result);
        console.log(`${this.whose} roll result is ${result}.`);
        return result;
    }
}

async function main() {
    let dice;
    try {
        dice = new DiceConfigParser(process.argv);
    } catch (e){
        console.error("Error:", e.message);
        process.exit(1);
    }

    const selection = new DiceSelection(dice.getDiceConfig(), new Protocol(2));
    await selection.start(dice.getRawDiceConfig());
    console.log(`Let's start the game. I will start.\n[It doesn't matter who goes first since we have different dice]`);
    const firstRoll = new DiceRoller("My", new Protocol(5), selection.getUserDice, selection.getComputerDice);
    const computerResult = await firstRoll.start(dice.getRawDiceConfig());
    const secondRoll = new DiceRoller("Your", new Protocol(5), selection.getUserDice, selection.getComputerDice);
    const userResult = await secondRoll.start(dice.getRawDiceConfig());
    secondRoll.result(userResult, computerResult);
}

main();