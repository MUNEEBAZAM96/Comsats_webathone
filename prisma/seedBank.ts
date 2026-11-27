/** Extra bank questions for demo papers. Keys are topic names within their subject. */

export type SeedBankDraft = {
  text: string;
  type: string;
  options?: string;
  answer: string;
  points: number;
  difficulty: "easy" | "medium" | "hard";
  topicKey: string;
  markingScheme?: string;
};

const scheme = (value: object) => JSON.stringify(value);

const sc = (
  text: string,
  options: string[],
  answer: string,
  topicKey: string,
  difficulty: SeedBankDraft["difficulty"],
  points = 1,
): SeedBankDraft => ({
  text,
  type: "single_choice",
  options: options.join("\n"),
  answer,
  points,
  difficulty,
  topicKey,
  markingScheme: scheme({
    version: 1,
    mode: "exact",
    correctOptions: [answer],
  }),
});

const mc = (
  text: string,
  options: string[],
  answers: string[],
  topicKey: string,
  difficulty: SeedBankDraft["difficulty"],
  points = 2,
): SeedBankDraft => ({
  text,
  type: "multiple_choice",
  options: options.join("\n"),
  answer: [...answers].sort().join("\n"),
  points,
  difficulty,
  topicKey,
  markingScheme: scheme({
    version: 1,
    mode: "all_of",
    correctOptions: answers,
    partialCredit: true,
  }),
});

const tf = (
  text: string,
  answer: "True" | "False",
  topicKey: string,
  difficulty: SeedBankDraft["difficulty"],
): SeedBankDraft => ({
  text,
  type: "true_false",
  options: "True\nFalse",
  answer,
  points: 1,
  difficulty,
  topicKey,
  markingScheme: scheme({
    version: 1,
    mode: "exact",
    correctOptions: [answer],
  }),
});

const sa = (
  text: string,
  keywords: string[],
  topicKey: string,
  difficulty: SeedBankDraft["difficulty"],
  points = 2,
): SeedBankDraft => ({
  text,
  type: "short_answer",
  answer: keywords.join(", "),
  points,
  difficulty,
  topicKey,
  markingScheme: scheme({
    version: 1,
    mode: "keywords_partial",
    keywords,
    partialCredit: true,
  }),
});

const la = (
  text: string,
  model: string,
  topicKey: string,
  difficulty: SeedBankDraft["difficulty"],
  points = 5,
): SeedBankDraft => ({
  text,
  type: "long_answer",
  answer: model,
  points,
  difficulty,
  topicKey,
  markingScheme: scheme({ version: 1, mode: "manual" }),
});

export const EXTRA_BANK_QUESTIONS: SeedBankDraft[] = [
  // JavaScript
  sc("Which keyword declares a block-scoped variable in JavaScript?", ["var", "let", "function", "static"], "let", "JavaScript", "easy"),
  sc("What does JSON.parse return for the string '{\"a\":1}'?", ["A string", "An object", "An array", "null"], "An object", "JavaScript", "easy"),
  sc("Which method adds an element to the end of an array?", ["push", "pop", "shift", "unshift"], "push", "JavaScript", "easy"),
  tf("=== compares both value and type in JavaScript.", "True", "JavaScript", "easy"),
  sc("What is the result of typeof null in JavaScript?", ["null", "object", "undefined", "number"], "object", "JavaScript", "medium"),
  sc("Which promise state means the operation finished successfully?", ["pending", "fulfilled", "rejected", "cancelled"], "fulfilled", "JavaScript", "medium"),
  mc("Which are valid ways to create a Promise?", ["new Promise(...)", "Promise.resolve(1)", "async function", "document.createElement"], ["new Promise(...)", "Promise.resolve(1)", "async function"], "JavaScript", "hard", 3),
  sa("Name the JavaScript event loop queue that handles microtasks.", ["microtask", "promise"], "JavaScript", "hard"),
  // TypeScript
  sc("What does the TypeScript type 'unknown' require before use?", ["Nothing", "A type assertion or narrowing", "Always cast to any", "Runtime checks only"], "A type assertion or narrowing", "TypeScript", "medium"),
  tf("Interfaces in TypeScript are erased at compile time.", "True", "TypeScript", "easy"),
  sc("Which TypeScript feature describes object shapes without creating runtime code?", ["enum", "interface", "namespace", "decorator"], "interface", "TypeScript", "easy"),
  sc("What does 'readonly' on a property mean?", ["It can only be written once in the whole app", "It cannot be reassigned after initialization", "It is private", "It is optional"], "It cannot be reassigned after initialization", "TypeScript", "medium"),
  sa("Name the TypeScript utility type that makes all properties optional.", ["Partial"], "TypeScript", "medium"),
  // React
  sc("Which hook stores local component state in React?", ["useEffect", "useState", "useMemo", "useRef"], "useState", "React", "easy"),
  tf("React keys help reconcile list items efficiently.", "True", "React", "easy"),
  sc("When does useEffect with an empty dependency array run?", ["Every render", "Once after mount", "Never", "Only on unmount"], "Once after mount", "React", "medium"),
  mc("Which are valid React hooks?", ["useState", "useEffect", "useContext", "useDatabase"], ["useState", "useEffect", "useContext"], "React", "medium"),
  la("Explain React component state and when you would lift state up.", "State is data owned by a component that can change over time. Lift state when siblings need the same data so a common parent owns it and passes props down.", "React", "medium"),
  // Next.js
  sc("Which Next.js App Router folder groups shared layouts?", ["(group)", "[id]", "api", "public"], "(group)", "Next.js", "medium"),
  tf("Server Components are the default in the Next.js App Router.", "True", "Next.js", "easy"),
  sc("Where do Route Handlers live in the App Router?", ["pages/api", "app/**/route.ts", "middleware.ts only", "public/api"], "app/**/route.ts", "Next.js", "medium"),
  sa("Name the Next.js file that customizes request middleware.", ["middleware"], "Next.js", "easy"),
  // Algorithms / OOP under Programming
  sc("What is the average-case time complexity of binary search?", ["O(n)", "O(log n)", "O(n log n)", "O(1)"], "O(log n)", "Algorithms", "easy"),
  sc("Which data structure is typically used for BFS?", ["Stack", "Queue", "Heap", "Tree only"], "Queue", "Algorithms", "medium"),
  tf("Quicksort always runs in O(n log n) worst case.", "False", "Algorithms", "medium"),
  la("Explain merge sort and its time complexity.", "Merge sort divides the array, sorts halves recursively, then merges. Time complexity is O(n log n) in best, average, and worst cases with O(n) extra space.", "Algorithms", "hard"),
  sc("Which OOP principle hides internal details behind an interface?", ["Inheritance", "Encapsulation", "Polymorphism", "Composition"], "Encapsulation", "Object-Oriented Programming", "easy"),
  tf("Polymorphism allows the same interface to behave differently by type.", "True", "Object-Oriented Programming", "easy"),
  sc("Which relationship is often preferred over deep inheritance?", ["Composition", "Global state", "Copy-paste", "Reflection"], "Composition", "Object-Oriented Programming", "medium"),
  // HTML/CSS / Web
  sc("Which HTML element is most appropriate for primary navigation?", ["<div>", "<nav>", "<section>", "<span>"], "<nav>", "HTML and CSS", "easy"),
  tf("Semantic HTML improves accessibility and SEO.", "True", "HTML and CSS", "easy"),
  sc("Which CSS layout is designed for one-dimensional flows?", ["Grid", "Flexbox", "Float only", "Table"], "Flexbox", "HTML and CSS", "medium"),
  sc("Which HTTP method is idempotent and typically used to fetch resources?", ["POST", "GET", "PATCH", "CONNECT"], "GET", "HTTP and REST APIs", "easy"),
  mc("Which status codes indicate client errors?", ["400", "401", "404", "500"], ["400", "401", "404"], "HTTP and REST APIs", "medium"),
  la("Explain core REST principles for designing a web API.", "Use resource-oriented URLs, standard HTTP methods, stateless requests, and consistent representations (often JSON). Prefer clear status codes and avoid server session for API state.", "HTTP and REST APIs", "medium"),
  sc("Which attribute associates a label with a form control?", ["name", "for", "idref", "aria-owns"], "for", "Accessibility", "easy"),
  tf("Color alone should not convey meaning for accessibility.", "True", "Accessibility", "easy"),
  sc("What does LCP measure in web performance?", ["First input delay", "Largest contentful paint", "Total blocking time", "Cumulative layout shift"], "Largest contentful paint", "Web Performance", "medium"),
  sa("Name one technique to reduce JavaScript bundle size.", ["code splitting", "tree shaking", "lazy loading"], "Web Performance", "medium"),
  // Databases
  sc("Which SQL statement removes rows matching a condition?", ["DROP", "DELETE", "TRUNCATE TABLE structure only", "ALTER"], "DELETE", "SQL Fundamentals", "easy"),
  tf("PRIMARY KEY values must be unique and not null.", "True", "SQL Fundamentals", "easy"),
  sc("Which join returns only matching rows from both tables?", ["LEFT JOIN", "INNER JOIN", "FULL OUTER JOIN", "CROSS JOIN"], "INNER JOIN", "SQL Fundamentals", "medium"),
  sc("What does 3NF mainly reduce?", ["Disk failures", "Update anomalies from transitive dependencies", "Network latency", "CPU usage"], "Update anomalies from transitive dependencies", "Database Design", "hard"),
  la("Explain database normalization and why 3NF matters.", "Normalization organizes attributes to reduce redundancy. 3NF requires non-key attributes depend only on the key, which reduces update anomalies and inconsistent data.", "Database Design", "medium"),
  sc("Which ACID property ensures a transaction leaves the database consistent?", ["Atomicity", "Consistency", "Isolation", "Durability"], "Consistency", "Transactions", "medium"),
  tf("A committed transaction must survive crashes (durability).", "True", "Transactions", "easy"),
  la("Explain how transactions preserve consistency.", "Transactions group operations so either all succeed or none do (atomicity), enforce integrity rules (consistency), isolate concurrent work, and persist committed results (durability).", "Transactions", "hard"),
  sc("What is the main purpose of a database index?", ["Encrypt rows", "Speed up lookups", "Replace foreign keys", "Store backups"], "Speed up lookups", "Indexing", "easy"),
  sa("Name a trade-off of adding many indexes.", ["slower writes", "storage", "maintenance"], "Indexing", "medium"),
  // Cybersecurity
  sc("Which attack injects malicious SQL through user input?", ["XSS", "CSRF", "SQL injection", "Clickjacking"], "SQL injection", "Application Security", "easy"),
  mc("Which defenses help against XSS?", ["Output encoding", "Content Security Policy", "HttpOnly cookies for session tokens", "Disabling HTTPS"], ["Output encoding", "Content Security Policy", "HttpOnly cookies for session tokens"], "Application Security", "hard", 3),
  tf("Storing passwords with unsalted MD5 is recommended.", "False", "Authentication and Authorization", "easy"),
  sc("OAuth access tokens are primarily used for what?", ["Password reset emails", "Delegated authorization to APIs", "DNS resolution", "Disk encryption"], "Delegated authorization to APIs", "Authentication and Authorization", "medium"),
  la("Compare authentication and authorization.", "Authentication verifies who the user is (login, MFA). Authorization decides what that identity may do (roles, permissions, policies).", "Authentication and Authorization", "medium"),
  sc("Which protocol encrypts HTTP traffic?", ["FTP", "HTTPS/TLS", "SMTP without STARTTLS", "Telnet"], "HTTPS/TLS", "Network Security", "easy"),
  tf("Defense in depth means relying on a single firewall rule.", "False", "Network Security", "easy"),
  la("Explain a secure password-storage design.", "Hash passwords with a slow adaptive algorithm (e.g. Argon2/bcrypt), unique salt per password, optional secret/pepper, never store plaintext, and protect against online guessing with rate limits.", "Secure Coding", "hard"),
  sc("Which practice reduces secret leakage in apps?", ["Hardcoding keys in the client", "Environment variables on the server", "Committing .env to git", "Logging full connection strings"], "Environment variables on the server", "Secure Coding", "medium"),
  // Software engineering
  sc("Which Git command creates a new branch?", ["git commit", "git branch", "git blame", "git stash drop"], "git branch", "Git and Collaboration", "easy"),
  tf("A pull request is used to review and merge changes.", "True", "Git and Collaboration", "easy"),
  sc("What does a unit test typically verify?", ["Whole system in production", "A small unit of code in isolation", "Only UI screenshots", "Network firewalls"], "A small unit of code in isolation", "Testing", "easy"),
  sa("Name a test double type used to replace a dependency.", ["mock", "stub", "fake", "spy"], "Testing", "medium"),
  sc("Which diagram is common for system design APIs?", ["Sequence diagram", "Pie chart of fonts", "CSS selector tree", "Git reflog"], "Sequence diagram", "System Design", "medium"),
  tf("Horizontal scaling adds more machines to handle load.", "True", "System Design", "easy"),
  sc("In Scrum, what is the short daily sync called?", ["Sprint review", "Daily standup", "Retro only", "Backlog burn"], "Daily standup", "Agile Development", "easy"),
  sa("Name one Agile artifact that lists upcoming work.", ["backlog", "product backlog"], "Agile Development", "easy"),
  // CS fundamentals
  sc("Which structure follows LIFO order?", ["Queue", "Stack", "Graph", "Set"], "Stack", "Data Structures", "easy"),
  sc("What is the worst-case lookup time for a balanced BST?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], "O(log n)", "Data Structures", "medium"),
  tf("A hash table provides average-case O(1) lookups.", "True", "Data Structures", "easy"),
  sc("Which OS concept switches CPU among processes?", ["Paging", "Scheduling", "Compilation", "Linking"], "Scheduling", "Operating Systems", "medium"),
  tf("Virtual memory lets processes use more address space than physical RAM.", "True", "Operating Systems", "medium"),
  sc("Which layer of the Internet model includes TCP?", ["Application", "Transport", "Link", "Physical"], "Transport", "Computer Networks", "medium"),
  sa("Name the protocol commonly used to resolve hostnames to IP addresses.", ["DNS"], "Computer Networks", "easy"),
  sc("What does CPU cache mainly improve?", ["Disk capacity", "Average memory access latency", "Monitor resolution", "Battery chemistry"], "Average memory access latency", "Computer Architecture", "medium"),
  tf("Pipelining overlaps instruction stages to improve throughput.", "True", "Computer Architecture", "medium"),
  // Extra long answers requested
  la("Explain REST principles with examples of resources and methods.", "Model nouns as resources (/users/42), use GET/POST/PUT/PATCH/DELETE appropriately, keep servers stateless, return JSON with proper status codes, and version carefully.", "HTTP and REST APIs", "hard"),
  la("Explain an algorithm of your choice and analyze its time complexity.", "Example: binary search on a sorted array halves the search space each step, giving O(log n) time and O(1) extra space (iterative).", "Algorithms", "hard"),
];
