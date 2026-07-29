import type { TriviaQuestion } from "./triviaQuality";

const BANK: Record<string, TriviaQuestion[]> = {
  Sports: [
    { question: "How many points is a touchdown worth before the extra-point attempt?", answers: ["3", "6", "7", "8"], correct: "B", difficulty: "easy", explanation: "A touchdown is worth six points before any conversion attempt." },
    { question: "In basketball, how many players from one team are on the court at once?", answers: ["4", "5", "6", "7"], correct: "B", difficulty: "easy", explanation: "A basketball team fields five players on the court." },
    { question: "Which country won the first men's FIFA World Cup in 1930?", answers: ["Brazil", "Argentina", "Uruguay", "Italy"], correct: "C", difficulty: "medium", explanation: "Uruguay hosted and won the first men's World Cup in 1930." },
    { question: "What surface is used at the Wimbledon tennis tournament?", answers: ["Clay", "Grass", "Hard court", "Carpet"], correct: "B", difficulty: "easy", explanation: "Wimbledon is played on grass courts." },
  ],
  Science: [
    { question: "Which planet is known as the Red Planet?", answers: ["Venus", "Mars", "Jupiter", "Mercury"], correct: "B", difficulty: "easy", explanation: "Mars appears reddish because of iron oxides on its surface." },
    { question: "What gas do plants absorb during photosynthesis?", answers: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correct: "C", difficulty: "easy", explanation: "Plants use carbon dioxide to produce sugars during photosynthesis." },
    { question: "What is the chemical symbol for gold?", answers: ["Ag", "Au", "Gd", "Go"], correct: "B", difficulty: "easy", explanation: "Gold's chemical symbol is Au." },
    { question: "Which part of a cell contains most of its genetic material?", answers: ["Nucleus", "Ribosome", "Cell wall", "Cytoplasm"], correct: "A", difficulty: "medium", explanation: "In eukaryotic cells, most DNA is stored in the nucleus." },
  ],
  Movies: [
    { question: "Which film features a theme park filled with cloned dinosaurs?", answers: ["Jaws", "Jurassic Park", "King Kong", "Alien"], correct: "B", difficulty: "easy", explanation: "Jurassic Park centers on a theme park populated by cloned dinosaurs." },
    { question: "In The Wizard of Oz, what road does Dorothy follow?", answers: ["Silver Road", "Emerald Road", "Yellow Brick Road", "Ruby Road"], correct: "C", difficulty: "easy", explanation: "Dorothy follows the Yellow Brick Road toward the Emerald City." },
    { question: "Which movie is centered on a boxer named Rocky Balboa?", answers: ["Raging Bull", "Creed", "Rocky", "The Fighter"], correct: "C", difficulty: "easy", explanation: "Rocky Balboa is the title character of Rocky." },
    { question: "What is the name of the kingdom in Frozen?", answers: ["Arendelle", "Corona", "Genovia", "Agrabah"], correct: "A", difficulty: "medium", explanation: "Frozen is set primarily in the kingdom of Arendelle." },
  ],
  History: [
    { question: "Who was the first president of the United States?", answers: ["John Adams", "Thomas Jefferson", "George Washington", "James Madison"], correct: "C", difficulty: "easy", explanation: "George Washington served as the first U.S. president." },
    { question: "Which ancient civilization built Machu Picchu?", answers: ["Maya", "Aztec", "Inca", "Roman"], correct: "C", difficulty: "medium", explanation: "Machu Picchu was built by the Inca civilization." },
    { question: "The Renaissance began in which European country?", answers: ["France", "Italy", "England", "Spain"], correct: "B", difficulty: "medium", explanation: "The Renaissance began in Italian city-states before spreading across Europe." },
    { question: "Which wall fell in 1989, symbolizing the end of Cold War divisions in Europe?", answers: ["Hadrian's Wall", "Berlin Wall", "Great Wall", "Western Wall"], correct: "B", difficulty: "easy", explanation: "The Berlin Wall fell in 1989." },
  ],
  Geography: [
    { question: "What is the largest ocean on Earth?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: "D", difficulty: "easy", explanation: "The Pacific Ocean is Earth's largest ocean." },
    { question: "Which river flows through Egypt?", answers: ["Amazon", "Danube", "Nile", "Yangtze"], correct: "C", difficulty: "easy", explanation: "The Nile flows through Egypt toward the Mediterranean Sea." },
    { question: "What is the capital of Canada?", answers: ["Toronto", "Vancouver", "Ottawa", "Montreal"], correct: "C", difficulty: "easy", explanation: "Ottawa is the capital of Canada." },
    { question: "Mount Kilimanjaro is located in which country?", answers: ["Kenya", "Tanzania", "Uganda", "Ethiopia"], correct: "B", difficulty: "medium", explanation: "Mount Kilimanjaro is in Tanzania." },
  ],
  Music: [
    { question: "How many keys does a standard modern piano have?", answers: ["76", "80", "88", "96"], correct: "C", difficulty: "medium", explanation: "A standard modern piano has 88 keys." },
    { question: "Which instrument typically has six strings?", answers: ["Trumpet", "Guitar", "Flute", "Trombone"], correct: "B", difficulty: "easy", explanation: "A standard guitar typically has six strings." },
    { question: "What musical symbol raises a note by one semitone?", answers: ["Flat", "Sharp", "Rest", "Clef"], correct: "B", difficulty: "medium", explanation: "A sharp raises a note by one semitone." },
    { question: "Which voice type is generally the highest adult male range?", answers: ["Bass", "Baritone", "Tenor", "Alto"], correct: "C", difficulty: "medium", explanation: "Tenor is generally the highest common adult male vocal range." },
  ],
};

const cursors = new Map<string, number>();

export function getFallbackTriviaQuestion(category: string): TriviaQuestion {
  const questions = BANK[category] ?? BANK.Science;
  const cursor = cursors.get(category) ?? Math.floor(Math.random() * questions.length);
  const question = questions[cursor % questions.length];
  cursors.set(category, (cursor + 1) % questions.length);
  return structuredClone(question);
}
