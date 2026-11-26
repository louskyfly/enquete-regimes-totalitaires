export const META = {
  title: "Contrôle — Deux régimes totalitaires",
  subtitle: "L'URSS de Staline et l'Allemagne nazie",
  level: "Troisième",
  version: "1.1",
  updated: "26 novembre 2026"
};

// Mode contrôle : masque les indices, les synthèses et les corrections
// automatiques. Passer à false pour retrouver la version d'entraînement.
export const CONTROL_MODE = true;

export const IMAGES = [
  {
    id: "img-montage",
    src: "assets/images/staline-hitler-montage.jpg",
    alt: "Montage en deux parties : Staline à gauche devant un drapeau soviétique, Hitler à droite devant des drapeaux nazis.",
    title: "Staline et Hitler, un montage en deux camps",
    nature: "Montage graphique",
    caption:
      "Staline à gauche, Hitler à droite, chacun sur fond de symboles de son régime. Ce n'est pas une photographie de rencontre : c'est un montage qui construit un face-à-face.",
    credit: "Image fournie par l'enseignant — source et date à préciser.",
    caution:
      "L'image contient des symboles nazis et soviétiques. Elle est montrée comme un document à analyser, pas comme une illustration à admirer."
  },
  {
    id: "img-portraits",
    src: "assets/images/portraits-staline-hitler.jpg",
    alt: "Portraits rapprochés de Staline et Hitler en noir et blanc.",
    title: "Deux portraits rapprochés",
    nature: "Montage de portraits",
    caption:
      "Deux portraits d'apparatchiks et de chefs de guerre rapprochés dans une même image. Le cadrage serré et le noir et blanc donnent une impression de puissance et de gravité.",
    credit: "Image fournie par l'enseignant — source et date à préciser.",
    caution:
      "Montage, et non photographie d'une rencontre. Les effets de cadrage et de contraste doivent être questionnés."
  },
  {
    id: "img-petit",
    src: "assets/images/hitler-staline-petit.jpg",
    alt: "Petit montage de deux portraits de Hitler et Staline sur un fond sombre.",
    title: "Un face-à-face compact",
    nature: "Montage de portraits",
    caption:
      "Un format réduit, presque une vignette, qui rapproche les deux dictateurs. L'arrière-plan flou et le contraste noir et blanc renforcent l'effet dramatique.",
    credit: "Image fournie par l'enseignant — source et date à préciser.",
    caution:
      "Montage. Il ne prouve pas une rencontre et ne résume pas à lui seul l'histoire des deux régimes."
  }
];

export const BRIEFING = {
  mission:
    "Un comité prépare une exposition comparée sur l'URSS de Staline et l'Allemagne nazie. Il dispose d'un tableau de synthèse, mais plusieurs affirmations sont trop simples ou fausses. Ta mission : vérifier ce tableau à partir de quatre dossiers documentaires, puis construire une carte mentale qui distingue les points communs, les différences et les affirmations à nuancer.",
  objectives: [
    "Lire des documents historiques courts et identifier leur nature, leur auteur et leur contexte.",
    "Repérer les mécanismes communs aux deux régimes sans les confondre.",
    "Distinguer deux idéologies opposées : le stalinisme et le nazisme.",
    "Construire une carte mentale lisible, avec des mots-clés, des exemples et des sources.",
    "Rédiger une conclusion comparative de trois à cinq phrases."
  ],
  warning:
    "Ce dossier parle de dictatures, de persécutions et de génocide. Aucune image d'exécution ou de cadavre n'est utilisée. Les textes peuvent être difficiles : tu peux demander une pause, et tu n'es jamais obligé(e) de tout lire seul(e).",
  method:
    "Chaque idée de ta carte devra être reliée à un dossier. Une affirmation sans source reste une hypothèse : place-la dans la catégorie « à vérifier / à nuancer »."
};

export const DOSSIERS = [
  {
    id: "urss",
    number: 1,
    regime: "URSS",
    regimeClass: "urss",
    title: "Le stalinisme en actes",
    type: "Notice de synthèse (deux extraits)",
    date: "1929-1953",
    source:
      "Romain Ducoulombier, « Qu'est-ce que le stalinisme ? », EHNE ; Alexandre Sumpf, « 1937-1938 : la Grande Terreur en URSS », EHNE.",
    url: "https://ehne.fr/fr/encyclopedie/th%C3%A9matiques/l%27europe-politique/les-modeles-politiques-pour-faire-l%27europe/qu%27est-ce-que-le-stalinisme",
    urlLabel: "Ouvrir la notice EHNE",
    caution:
      "Les chiffres de la famine et de la Grande Terreur sont des estimations d'historiens, pas des données officielles du régime.",
    extraSources: [
      {
        label: "EHNE — La Grande Terreur en URSS",
        url: "https://ehne.fr/fr/eduscol/terminale-generale/fragilites-des-democraties-totalitarismes-et-seconde-guerre-mondiale-1929-1945/les-regimes-totalitaires/grande-terreur-en-urss-1937-1938-la"
      }
    ],
    texts: [
      {
        title: "Un pouvoir personnel dans un parti unique",
        paragraphs: [
          "Après la mort de Lénine en 1924, Staline, secrétaire général du Parti communiste depuis 1922, écarte progressivement ses rivaux. En 1929, il lance la « grande rupture » : collectivisation forcée des campagnes et premiers plans quinquennaux. Le parti unique contrôle l'État, la presse, les syndicats et les organisations de jeunesse. Le régime se réclame du marxisme-léninisme et de la dictature du prolétariat.",
          "La Constitution de 1936 proclame des droits et le suffrage universel, mais elle ne limite pas le pouvoir du parti. Dans les faits, les élections ne sont pas concurrentielles et la police politique dispose d'un pouvoir immense."
        ]
      },
      {
        title: "Violence de masse, Goulag et culte du chef",
        paragraphs: [
          "La collectivisation s'accompagne de la « dékoulakisation » : les paysans jugés riches sont déportés ou tués. La famine de 1932-1933 fait environ 7 millions de morts, dont 4 millions en Ukraine. Entre 1937 et 1938, la Grande Terreur du NKVD condamne des centaines de milliers de personnes : plus de 750 000 sont exécutées et plus d'un million sont déportées au Goulag.",
          "Le régime construit aussi le culte de Staline, « petit père des peuples », et célèbre les réalisations de l'industrie lourde. L'économie est nationalisée et planifiée, mais elle repose sur la contrainte et le travail forcé."
        ]
      }
    ],
    questions: [
      {
        id: "urss-q1",
        prompt: "Qui détient le pouvoir ? Comment Staline s'impose-t-il ?",
        hint: "Appuie-toi sur les dates : 1922, 1924, 1929.",
        placeholder: "Je repère que..."
      },
      {
        id: "urss-q2",
        prompt: "Quels groupes sont frappés par la collectivisation et la Grande Terreur ?",
        hint: "Cherche les mots « koulaks », « ennemis du peuple », « NKVD ».",
        placeholder: "Les victimes sont..."
      },
      {
        id: "urss-q3",
        prompt: "La Constitution de 1936 limite-t-elle le pouvoir de Staline ? Justifie avec les deux extraits.",
        hint: "Compare ce que le texte proclame et ce que dit le second extrait.",
        placeholder: "Le texte proclame..., mais..."
      },
      {
        id: "urss-q4",
        prompt: "Comment le régime associe-t-il propagande et violence ?",
        hint: "Cherche le culte de Staline et les réalisations célébrées.",
        placeholder: "D'un côté..., de l'autre..."
      }
    ],
    takeaway:
      "Le stalinisme est un pouvoir personnel de parti unique, fondé sur une idéologie marxiste-léniniste, une économie nationalisée et planifiée, et une violence de masse (collectivisation, famine, Grande Terreur, Goulag)."
  },
  {
    id: "allemagne-1933",
    number: 2,
    regime: "Allemagne nazie",
    regimeClass: "allemagne",
    title: "Comment Hitler détruit la République",
    type: "Analyse d'images et textes juridiques",
    date: "1933-1934",
    source:
      "Paul Bernard-Nouraud, « Le Reichstag », Histoire par l'image, 2024 ; GHDI, décret du 28 février 1933 et loi des pleins pouvoirs du 23 mars 1933.",
    url: "https://histoire-image.org/etudes/reichstag",
    urlLabel: "Ouvrir l'analyse d'Histoire par l'image",
    caution:
      "Les textes originaux du GHDI sont en allemand et en anglais ; ils sont ici reformulés en français. Les décrets et la loi des pleins pouvoirs sont des textes du régime nazi : ils sont étudiés comme documents historiques, pas approuvés.",
    extraSources: [
      {
        label: "GHDI — Décret du 28 février 1933",
        url: "https://germanhistorydocs.org/en/nazi-germany-1933-1945/decree-of-the-reich-president-for-the-protection-of-the-people-and-state-reichstag-fire-decree-february-28-1933"
      },
      {
        label: "GHDI — Loi des pleins pouvoirs",
        url: "https://germanhistorydocs.org/en/nazi-germany-1933-1945/the-enabling-act-march-24-1933"
      }
    ],
    texts: [
      {
        title: "Une nomination, pas une élection",
        paragraphs: [
          "Le 30 janvier 1933, Hitler n'est pas élu : il est nommé chancelier par le président Hindenburg. Son parti, le NSDAP, obtient 43,9 % des voix aux élections du 5 mars 1933, sans majorité absolue. Il gouverne d'abord avec des alliés conservateurs.",
          "Dans la nuit du 27 au 28 février, le Reichstag brûle. Le lendemain, un décret suspend les principales libertés de la Constitution de Weimar. Les élections se déroulent dans un climat de violence. Le 23 mars, le Reichstag vote la loi des pleins pouvoirs, qui permet au gouvernement de légiférer sans lui. Les autres partis sont ensuite interdits."
        ]
      },
      {
        title: "La terreur exercée avec les formes du droit",
        paragraphs: [
          "La dictature s'installe en utilisant les formes du droit : décrets, lois, administration. La police politique (Gestapo) et la SS arrêtent les opposants ; le camp de Dachau ouvre en mars 1933. La propagande est confiée à un ministère dirigé par Goebbels.",
          "Après la mort de Hindenburg, en août 1934, Hitler cumule les fonctions de chancelier et de président et prend le titre de Führer. La violence de rue des SA a joué un rôle majeur avant 1933, mais elle ne suffit pas à expliquer la prise du pouvoir : les élites conservatrices ont cru pouvoir contrôler Hitler."
        ]
      }
    ],
    questions: [
      {
        id: "all-q1",
        prompt: "Hitler a-t-il été élu chancelier ? Justifie.",
        hint: "Relis la première phrase du dossier.",
        placeholder: "Non, car..."
      },
      {
        id: "all-q2",
        prompt: "Quelles étapes lui permettent de concentrer le pouvoir entre janvier 1933 et août 1934 ?",
        hint: "Repère au moins quatre dates et ce qui se passe à chaque fois.",
        placeholder: "D'abord..., ensuite..., puis..."
      },
      {
        id: "all-q3",
        prompt: "Pourquoi le décret du 28 février 1933 est-il un tournant ?",
        hint: "Que suspend-il ? Contre qui est-il utilisé ?",
        placeholder: "Ce décret..."
      },
      {
        id: "all-q4",
        prompt: "Pourquoi parle-t-on d'une conquête « légale » du pouvoir ?",
        hint: "Quels outils juridiques sont utilisés ?",
        placeholder: "Le régime utilise..."
      }
    ],
    takeaway:
      "Hitler est nommé, pas élu. Il utilise les institutions, la violence et la propagande pour détruire la démocratie de Weimar et construire une dictature."
  },
  {
    id: "allemagne-race",
    number: 3,
    regime: "Allemagne nazie",
    regimeClass: "allemagne",
    title: "La race inscrite dans la loi",
    type: "Textes juridiques et notice de musée",
    date: "1935-1945",
    source:
      "United States Holocaust Memorial Museum, « Les lois de Nuremberg », notice et traduction française.",
    url: "https://encyclopedia.ushmm.org/content/fr/article/nuremberg-laws",
    urlLabel: "Ouvrir la notice du USHMM",
    caution:
      "Ce dossier contient un texte antisémite et raciste. Il est étudié comme document historique, pour comprendre la persécution, et non comme une norme ou une opinion acceptable.",
    extraSources: [],
    texts: [
      {
        title: "Deux lois, une définition raciale",
        paragraphs: [
          "Le 15 septembre 1935, le régime nazi promulgue deux lois dites « lois de Nuremberg ». La loi sur la citoyenneté du Reich réserve la citoyenneté aux personnes « de sang allemand ou apparenté » ; les Juifs deviennent des « sujets de l'État », privés des droits politiques.",
          "La loi pour la protection du sang et de l'honneur allemand interdit les mariages et les relations entre Juifs et « Allemands ». Le régime définit juridiquement qui est juif selon le nombre de grands-parents juifs : la religion n'est plus le critère principal, c'est la « race »."
        ]
      },
      {
        title: "Une idéologie au cœur du régime",
        paragraphs: [
          "Les lois de Nuremberg ne sont pas un accident : elles inscrivent dans le droit l'idéologie raciste, antisémite et ultranationaliste d'extrême droite du nazisme. Cette idéologie affirme une hiérarchie des « races », fait des Juifs un ennemi absolu et justifie la conquête d'un « espace vital » à l'Est.",
          "Entre 1933 et 1939, la persécution s'aggrave : boycott des commerces juifs, exclusion de la fonction publique, autodafés, nuit de Cristal en 1938. Après 1941, la persécution devient un génocide : environ 6 millions de Juifs sont assassinés. Les lois de 1935 sont une étape de ce processus, pas son point de départ ni son point final."
        ]
      }
    ],
    questions: [
      {
        id: "race-q1",
        prompt: "Quelle différence la loi fait-elle entre « citoyen » et « sujet de l'État » ?",
        hint: "Cherche les droits politiques.",
        placeholder: "Le citoyen..., le sujet..."
      },
      {
        id: "race-q2",
        prompt: "Comment le régime définit-il qui est juif ? Pourquoi est-ce une définition raciale ?",
        hint: "Le critère est-il la religion ou l'ascendance ?",
        placeholder: "La loi se fonde sur..."
      },
      {
        id: "race-q3",
        prompt: "En quoi ces lois révèlent-elles l'idéologie nazie ?",
        hint: "Relie-les à l'antisémitisme et à la hiérarchie des races.",
        placeholder: "Ces lois montrent que..."
      },
      {
        id: "race-q4",
        prompt: "Pourquoi 1935 n'est-elle qu'une étape ?",
        hint: "Que se passe-t-il en 1938 et après 1941 ?",
        placeholder: "Après 1935..."
      }
    ],
    takeaway:
      "Les lois de Nuremberg inscrivent le racisme et l'antisémitisme dans le droit. Elles préparent et légitiment une persécution qui conduit au génocide."
  },
  {
    id: "comparer",
    number: 4,
    regime: "Comparaison",
    regimeClass: "commun",
    title: "Deux mises en scène de la puissance",
    type: "Photographie et analyse",
    date: "1937",
    source:
      "Alexandre Sumpf, « Duel architectural à l'Exposition universelle de Paris de 1937 », Histoire par l'image, 2019.",
    url: "https://histoire-image.org/etudes/duel-architectural-exposition-universelle-paris-1937",
    urlLabel: "Ouvrir l'analyse d'Histoire par l'image",
    caution:
      "La photographie montre des symboles nazis. Elle est analysée pour ce qu'elle est : une mise en scène de propagande, pas une image à admirer.",
    extraSources: [],
    texts: [
      {
        title: "Un face-à-face de pavillons",
        paragraphs: [
          "À l'Exposition universelle de Paris, en 1937, le pavillon soviétique et le pavillon allemand se font face. Le pavillon soviétique, conçu par Boris Iofan, est surmonté de L'Ouvrier et la kolkhozienne, une sculpture monumentale de Vera Moukhina. Le pavillon allemand, conçu par Albert Speer, impose une architecture néoclassique et massive, avec l'aigle du Reich.",
          "Les deux bâtiments utilisent la verticalité, la symétrie et la démesure pour impressionner les visiteurs. Le face-à-face n'a pas été prémédité par les organisateurs, mais il est devenu un symbole de la rivalité entre les deux régimes."
        ]
      },
      {
        title: "Deux propagandes, deux idéologies",
        paragraphs: [
          "Les deux pavillons se ressemblent par leurs moyens : grandeur, ordre, mise en scène de la puissance. Ils diffèrent par leur message. L'URSS se présente comme le pays des travailleurs, du progrès et de l'industrie : la sculpture associe un ouvrier et une paysanne, et le réalisme socialiste célèbre le peuple.",
          "L'Allemagne nazie se présente comme une communauté raciale et militaire, guidée par un chef : l'aigle, la croix gammée et l'architecture néoclassique disent la domination. Comparer ces images ne revient pas à dire que les deux régimes sont identiques : cela permet de voir des techniques communes au service d'idéologies opposées."
        ]
      }
    ],
    questions: [
      {
        id: "comp-q1",
        prompt: "Quels moyens communs les deux pavillons utilisent-ils ?",
        hint: "Regarde la taille, la symétrie, les symboles.",
        placeholder: "Les deux..."
      },
      {
        id: "comp-q2",
        prompt: "Qu'est-ce qui distingue leurs messages ?",
        hint: "Compare la sculpture soviétique et l'aigle allemand.",
        placeholder: "Le pavillon soviétique..., tandis que..."
      },
      {
        id: "comp-q3",
        prompt: "Pourquoi cette photographie est-elle une source sur la propagande ?",
        hint: "Qui a commandé ces bâtiments ? Dans quel but ?",
        placeholder: "Cette image..."
      },
      {
        id: "comp-q4",
        prompt: "Que ne montre pas la photographie ?",
        hint: "Pense au cadrage, aux visiteurs, au contexte de l'Exposition.",
        placeholder: "On ne voit pas..."
      }
    ],
    takeaway:
      "Les deux régimes utilisent des techniques de propagande comparables (monumentalité, symboles, foules), mais au service d'idéologies opposées. Comparer n'est pas confondre."
  }
];

export const MECHANISMS = [
  {
    id: "m1",
    label: "Un parti unique dirige l'État et la société.",
    answer: "both",
    feedback:
      "Oui, dans les deux cas. En URSS, le Parti communiste encadre l'État et les organisations. En Allemagne, le NSDAP devient le seul parti autorisé en 1933 et noyaute l'administration, la police et les organisations de masse."
  },
  {
    id: "m2",
    label: "Le chef fait l'objet d'un culte organisé.",
    answer: "both",
    feedback:
      "Staline et Hitler sont présentés comme des figures exceptionnelles, au-dessus des institutions. Les images, les meetings et les récits officiels construisent ce culte."
  },
  {
    id: "m3",
    label: "Une police politique arrête sans procès et envoie dans des camps.",
    answer: "both",
    feedback:
      "Le NKVD et la Gestapo/SS partagent la détention arbitraire et le camp. Mais les cibles et les logiques diffèrent : classe et « ennemi du peuple » en URSS, race et opposition politique en Allemagne."
  },
  {
    id: "m4",
    label: "L'économie est collectivisée et planifiée par l'État.",
    answer: "urss",
    feedback:
      "En URSS : nationalisation, collectivisation et plans quinquennaux. En Allemagne, la propriété privée est maintenue, même si l'État dirige l'économie vers l'autarcie et la guerre."
  },
  {
    id: "m5",
    label: "La propriété privée est maintenue, mais l'État oriente l'économie vers la guerre.",
    answer: "allemagne",
    feedback:
      "C'est le cas nazi : les entreprises privées restent, mais le plan de quatre ans (1936), l'autarcie et le réarmement orientent la production."
  },
  {
    id: "m6",
    label: "La loi définit les droits selon l'appartenance « raciale ».",
    answer: "allemagne",
    feedback:
      "Les lois de Nuremberg (1935) en sont l'exemple. L'URSS définit officiellement les droits selon la classe sociale, pas selon une « race »."
  },
  {
    id: "m7",
    label: "Une constitution proclame des libertés qui ne sont pas respectées.",
    answer: "urss",
    feedback:
      "La Constitution soviétique de 1936 proclame des droits et le suffrage universel ; la réalité est celle du parti unique, de la censure et de la terreur. En Allemagne, la Constitution de Weimar est suspendue, pas simplement vidée de son sens."
  },
  {
    id: "m8",
    label: "L'ennemi principal est défini par la classe sociale.",
    answer: "urss",
    feedback:
      "La lutte des classes structure la propagande et la répression soviétiques : koulaks, bourgeois, « ennemis du peuple ». Le nazisme définit l'ennemi par la race."
  },
  {
    id: "m9",
    label: "La propagande utilise des images de masse et des symboles.",
    answer: "both",
    feedback:
      "Les deux régimes utilisent affiches, photographies, meetings, défilés et symboles. Les contenus et les esthétiques diffèrent."
  }
];

export const SORT_COLUMNS = [
  { id: "commun", label: "Points communs", hint: "Ce que les deux régimes partagent." },
  { id: "urss", label: "URSS de Staline", hint: "Ce qui est propre à l'URSS." },
  { id: "allemagne", label: "Allemagne nazie", hint: "Ce qui est propre à l'Allemagne nazie." },
  { id: "nuance", label: "À vérifier / à nuancer", hint: "Affirmations trop simples, fausses ou imprécises." }
];

export const SORT_ITEMS = [
  {
    id: "s1",
    text: "Parti unique et chef incontesté",
    nodeTitle: "Parti unique et chef",
    answer: "commun",
    feedback: "Point commun, mais à préciser : les partis et les modes d'exercice du pouvoir ne sont pas identiques."
  },
  {
    id: "s2",
    text: "Culte de la personnalité",
    nodeTitle: "Culte de la personnalité",
    answer: "commun",
    feedback: "Point commun : les deux régimes organisent des images et des récits qui exaltent le chef."
  },
  {
    id: "s3",
    text: "Police politique et camps",
    nodeTitle: "Police politique et camps",
    answer: "commun",
    feedback: "Point commun : détention arbitraire et camps. Les cibles et les logiques restent différentes."
  },
  {
    id: "s4",
    text: "Collectivisation des terres et plans quinquennaux",
    nodeTitle: "Collectivisation et plans",
    answer: "urss",
    feedback: "Propre à l'URSS : nationalisation, collectivisation, plans quinquennaux."
  },
  {
    id: "s5",
    text: "Lois raciales de Nuremberg (1935)",
    nodeTitle: "Lois de Nuremberg",
    answer: "allemagne",
    feedback: "Propre à l'Allemagne nazie : la loi y définit les droits selon la « race »."
  },
  {
    id: "s6",
    text: "Autarcie et réarmement",
    nodeTitle: "Autarcie et réarmement",
    answer: "allemagne",
    feedback: "Propre à l'Allemagne nazie : économie privée encadrée, autarcie, préparation de la guerre."
  },
  {
    id: "s7",
    text: "Goulag et Grande Terreur (1937-1938)",
    nodeTitle: "Goulag et Grande Terreur",
    answer: "urss",
    feedback: "Propre à l'URSS : répression de masse du NKVD et système du Goulag."
  },
  {
    id: "s8",
    text: "Hitler nommé chancelier par Hindenburg en 1933",
    nodeTitle: "Hitler nommé chancelier",
    answer: "allemagne",
    feedback: "Propre à l'Allemagne nazie : Hitler est nommé, pas élu."
  },
  {
    id: "s9",
    text: "Propagande de masse et mise en scène des foules",
    nodeTitle: "Propagande de masse",
    answer: "commun",
    feedback: "Point commun : affiches, meetings, défilés, symboles. Les messages diffèrent."
  },
  {
    id: "s10",
    text: "Les deux régimes sont identiques",
    nodeTitle: "Les régimes sont identiques ?",
    answer: "nuance",
    feedback: "Faux. Ils partagent des techniques de domination, mais leurs idéologies, leurs cibles et leurs histoires diffèrent."
  },
  {
    id: "s11",
    text: "Le nazisme est un socialisme parce que le parti s'appelle NSDAP",
    nodeTitle: "Le nazisme est-il socialiste ?",
    answer: "nuance",
    feedback: "Faux. Le nom du parti ne définit pas son économie : l'Allemagne nazie maintient la propriété privée et réprime les syndicats et la gauche."
  },
  {
    id: "s12",
    text: "La famine de 1932-1933 a fait environ 7 millions de morts",
    nodeTitle: "Famine de 1932-1933",
    answer: "urss",
    feedback: "C'est une estimation d'historiens (EHNE), à présenter comme telle."
  },
  {
    id: "s13",
    text: "L'extermination des Juifs d'Europe fait 6 millions de victimes",
    nodeTitle: "Génocide des Juifs d'Europe",
    answer: "allemagne",
    feedback: "Génocide planifié et exécuté par l'Allemagne nazie et ses complices, surtout entre 1941 et 1945."
  },
  {
    id: "s14",
    text: "Staline arrive au pouvoir en 1924",
    nodeTitle: "Staline arrive en 1924 ?",
    answer: "nuance",
    feedback: "Imprécis. Lénine meurt en 1924, mais Staline est secrétaire général depuis 1922 et construit son pouvoir personnel jusqu'en 1929."
  }
];

export const GLOSSARY = [
  { term: "Parti unique", def: "Système politique où un seul parti est autorisé et dirige l'État." },
  { term: "Totalitarisme", def: "Modèle d'analyse pour les régimes qui cherchent à contrôler la société entière par un parti unique, une idéologie, la propagande et la terreur. Le mot est utile mais ne doit pas effacer les différences entre les régimes." },
  { term: "Propagande", def: "Ensemble des moyens (affiches, presse, radio, cinéma, meetings) utilisés pour diffuser une vision du monde et orienter l'opinion." },
  { term: "Culte de la personnalité", def: "Mise en scène systématique d'un chef présenté comme exceptionnel, infaillible et proche du peuple." },
  { term: "Collectivisation", def: "Regroupement forcé des terres et des moyens de production dans des exploitations collectives." },
  { term: "Kolkhoze / sovkhoze", def: "Ferme collective (kolkhoze) ou ferme d'État (sovkhoze) en URSS." },
  { term: "Dékoulakisation", def: "Politique de répression et de déportation des paysans jugés riches (« koulaks ») en URSS." },
  { term: "Goulag", def: "Système de camps de travail forcé de l'URSS." },
  { term: "NKVD", def: "Police politique soviétique, responsable de la Grande Terreur." },
  { term: "Gestapo", def: "Police politique nazie, chargée de la répression des opposants." },
  { term: "SS", def: "Organisation paramilitaire nazie qui contrôle notamment les camps de concentration." },
  { term: "Autarcie", def: "Politique visant à rendre un pays économiquement autosuffisant." },
  { term: "Réarmement", def: "Augmentation des dépenses et de la production militaires." },
  { term: "Antisémitisme", def: "Hostilité envers les Juifs. Dans le nazisme, il prend une forme raciale et conduit au génocide." },
  { term: "Race (sens nazi)", def: "Catégorie pseudo-scientifique utilisée par les nazis pour hiérarchiser les groupes humains. La science actuelle rejette cette notion." },
  { term: "Espace vital (Lebensraum)", def: "Projet nazi de conquête de territoires à l'Est de l'Europe, au détriment des populations slaves et juives." },
  { term: "Génocide", def: "Destruction planifiée d'un groupe national, ethnique, racial ou religieux." },
  { term: "Shoah", def: "Génocide des Juifs d'Europe par l'Allemagne nazie et ses complices, environ 6 millions de victimes." }
];

export const BIBLIOGRAPHY = [
  {
    label: "Romain Ducoulombier, « Qu'est-ce que le stalinisme ? », EHNE",
    url: "https://ehne.fr/fr/encyclopedie/th%C3%A9matiques/l%27europe-politique/les-modeles-politiques-pour-faire-l%27europe/qu%27est-ce-que-le-stalinisme",
    consulted: "26/11/2026"
  },
  {
    label: "Alexandre Sumpf, « 1937-1938 : la Grande Terreur en URSS », EHNE",
    url: "https://ehne.fr/fr/eduscol/terminale-generale/fragilites-des-democraties-totalitarismes-et-seconde-guerre-mondiale-1929-1945/les-regimes-totalitaires/grande-terreur-en-urss-1937-1938-la",
    consulted: "26/11/2026"
  },
  {
    label: "Paul Bernard-Nouraud, « Le Reichstag », Histoire par l'image, novembre 2024",
    url: "https://histoire-image.org/etudes/reichstag",
    consulted: "26/11/2026"
  },
  {
    label: "German Historical Institute Washington, décret du 28 février 1933 (GHDI)",
    url: "https://germanhistorydocs.org/en/nazi-germany-1933-1945/decree-of-the-reich-president-for-the-protection-of-the-people-and-state-reichstag-fire-decree-february-28-1933",
    consulted: "26/11/2026"
  },
  {
    label: "German Historical Institute Washington, loi des pleins pouvoirs du 23 mars 1933 (GHDI)",
    url: "https://germanhistorydocs.org/en/nazi-germany-1933-1945/the-enabling-act-march-24-1933",
    consulted: "26/11/2026"
  },
  {
    label: "United States Holocaust Memorial Museum, « Les lois de Nuremberg »",
    url: "https://encyclopedia.ushmm.org/content/fr/article/nuremberg-laws",
    consulted: "26/11/2026"
  },
  {
    label: "Alexandre Sumpf, « Duel architectural à l'Exposition universelle de Paris de 1937 », Histoire par l'image, avril 2019",
    url: "https://histoire-image.org/etudes/duel-architectural-exposition-universelle-paris-1937",
    consulted: "26/11/2026"
  },
  {
    label: "Pour aller plus loin : Ian Kershaw, Hitler. Essai sur le charisme en politique, Gallimard, 2001",
    url: "",
    consulted: ""
  },
  {
    label: "Pour aller plus loin : Johann Chapoutot, Comprendre le nazisme, Tallandier, 2020",
    url: "",
    consulted: ""
  },
  {
    label: "Pour aller plus loin : Nicolas Werth, La Terreur et le désarroi. Staline et son système, Perrin, 2007",
    url: "",
    consulted: ""
  },
  {
    label: "Pour aller plus loin : Oleg Khlevniouk, Staline, Belin, 2017",
    url: "",
    consulted: ""
  }
];
