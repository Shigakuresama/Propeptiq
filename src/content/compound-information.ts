/**
 * Public identity data reviewed on 2026-09-06. This module is client-safe and
 * performs no network requests. Provenance and unresolved identities are in
 * docs/design/compound-information-sources.md.
 *
 * Reference molecular values describe the cited database record, never the
 * composition, concentration, purity, formulation or identity of a supplied lot.
 */
export type CompoundInformationProfile = Readonly<{
  slug: string;
  name: string;
  alternateNames: readonly string[];
  description?: string;
  constituents?: readonly Readonly<{ name: string; amountLabel?: string }>[];
  referenceMolecule?: Readonly<{
    cid: number;
    name: string;
    molecularFormula: string;
    /** Molecular weight in g/mol, preserving the precision returned by PubChem. */
    molecularWeight: string;
    sourceUrl: string;
  }>;
  sourceUrls: readonly string[];
}>;

const profileRecords: readonly CompoundInformationProfile[] = [
  {
    "slug": "tirzepatide",
    "name": "Tirzepatide",
    "alternateNames": [],
    "description": "The Tirzepatide reference describes a synthetic peptide conjugated to a fatty diacid group.",
    "referenceMolecule": {
      "cid": 156588324,
      "name": "Tirzepatide",
      "molecularFormula": "C225H348N48O68",
      "molecularWeight": "4813",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/156588324"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/156588324",
      "https://pubmed.ncbi.nlm.nih.gov/35658024/",
      "https://pubmed.ncbi.nlm.nih.gov/37385275/"
    ]
  },
  {
    "slug": "retatrutide",
    "name": "Retatrutide",
    "alternateNames": [],
    "description": "Retatrutide is indexed in PubChem’s reference collection with the research identifiers LY-3437943 and LY3437943.",
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/substance/528343961",
      "https://pubmed.ncbi.nlm.nih.gov/37366315/"
    ]
  },
  {
    "slug": "nad-plus",
    "name": "NAD+",
    "alternateNames": [
      "Nicotinamide adenine dinucleotide"
    ],
    "description": "Nicotinamide adenine dinucleotide is indexed under Nadide in PubChem.",
    "referenceMolecule": {
      "cid": 5892,
      "name": "Nadide",
      "molecularFormula": "C21H27N7O14P2",
      "molecularWeight": "663.4",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/5892"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/5892",
      "https://pubmed.ncbi.nlm.nih.gov/31572171/",
      "https://pubmed.ncbi.nlm.nih.gov/41704678/"
    ]
  },
  {
    "slug": "hgh",
    "name": "HGH",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "ghk-cu",
    "name": "GHK-CU",
    "alternateNames": [
      "Copper tripeptide complex"
    ],
    "description": "Copper tripeptide complex is a reviewed research name associated with GHK-Cu. PubChem indexes several different copper complexes under this name.",
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/139035031",
      "https://pubchem.ncbi.nlm.nih.gov/compound/133697840",
      "https://pubmed.ncbi.nlm.nih.gov/16847171/"
    ]
  },
  {
    "slug": "tesmorelin",
    "name": "Tesmorelin",
    "alternateNames": [
      "Tesamorelin",
      "TH9507"
    ],
    "description": "Tesamorelin and TH9507 are reviewed research names associated with the catalog spelling Tesmorelin.",
    "referenceMolecule": {
      "cid": 16137828,
      "name": "Tesamorelin",
      "molecularFormula": "C221H366N72O67S",
      "molecularWeight": "5136",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/16137828"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/16137828",
      "https://pubmed.ncbi.nlm.nih.gov/20554713/"
    ]
  },
  {
    "slug": "tesmorelin-ipa",
    "name": "Tesmorelin + IPA",
    "alternateNames": [],
    "description": "A catalog blend of Tesmorelin and IPA with individually listed component amounts.",
    "constituents": [
      {
        "name": "Tesmorelin",
        "amountLabel": "10 mg"
      },
      {
        "name": "IPA",
        "amountLabel": "3 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "bpc-157",
    "name": "BPC-157",
    "alternateNames": [
      "BPC157",
      "Pentadecapeptide BPC 157"
    ],
    "description": "BPC-157 is also indexed under the names BPC157 and Bepecin.",
    "referenceMolecule": {
      "cid": 9941957,
      "name": "Bpc-157",
      "molecularFormula": "C62H98N16O22",
      "molecularWeight": "1419.5",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/9941957"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/9941957",
      "https://pubmed.ncbi.nlm.nih.gov/40131143/",
      "https://pubmed.ncbi.nlm.nih.gov/21030672/"
    ]
  },
  {
    "slug": "tb500",
    "name": "TB500 (Thymosin B4 acetate)",
    "alternateNames": [],
    "description": "The owner catalog labels TB500 as Thymosin B4 acetate. That label is retained without substituting a different thymosin fragment.",
    "sourceUrls": []
  },
  {
    "slug": "bpc-tb-blend",
    "name": "BPC 5mg + TB 5mg",
    "alternateNames": [],
    "constituents": [
      {
        "name": "BPC",
        "amountLabel": "5 mg"
      },
      {
        "name": "TB",
        "amountLabel": "5 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "bpc-tb-blend-bb20",
    "name": "BPC 10mg + TB 10mg",
    "alternateNames": [],
    "constituents": [
      {
        "name": "BPC",
        "amountLabel": "10 mg"
      },
      {
        "name": "TB",
        "amountLabel": "10 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "bpc-tb-blend-bb40",
    "name": "BPC 20mg + TB 20mg",
    "alternateNames": [],
    "constituents": [
      {
        "name": "BPC",
        "amountLabel": "20 mg"
      },
      {
        "name": "TB",
        "amountLabel": "20 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "aod-9604",
    "name": "AOD 9604",
    "alternateNames": [
      "AOD-9604",
      "AOD9604"
    ],
    "referenceMolecule": {
      "cid": 71300630,
      "name": "Aod-9604",
      "molecularFormula": "C78H123N23O23S2",
      "molecularWeight": "1815.1",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/71300630"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/71300630",
      "https://pubmed.ncbi.nlm.nih.gov/11146367/",
      "https://pubmed.ncbi.nlm.nih.gov/11713213/"
    ]
  },
  {
    "slug": "mots-c",
    "name": "MOTS-C",
    "alternateNames": [],
    "description": "MOTS-c is indexed in PubChem as a mitochondria-derived peptide.",
    "referenceMolecule": {
      "cid": 146675088,
      "name": "Mots-c",
      "molecularFormula": "C101H152N28O22S2",
      "molecularWeight": "2174.6",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/146675088"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/146675088",
      "https://pubmed.ncbi.nlm.nih.gov/29593067/"
    ]
  },
  {
    "slug": "selank",
    "name": "Selank",
    "alternateNames": [],
    "description": "The Selank molecular reference is also indexed with the identifier TP-7.",
    "referenceMolecule": {
      "cid": 11765600,
      "name": "Selank",
      "molecularFormula": "C33H57N11O9",
      "molecularWeight": "751.9",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/11765600"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/11765600",
      "https://pubmed.ncbi.nlm.nih.gov/18454096/",
      "https://pubmed.ncbi.nlm.nih.gov/25176261/"
    ]
  },
  {
    "slug": "semax",
    "name": "Semax",
    "alternateNames": [],
    "description": "The Semax molecular reference is indexed under ACTH (4-7), Pro-Gly-Pro-.",
    "referenceMolecule": {
      "cid": 9811102,
      "name": "ACTH (4-7), Pro-Gly-Pro-",
      "molecularFormula": "C37H51N9O10S",
      "molecularWeight": "813.9",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/9811102"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/9811102",
      "https://pubmed.ncbi.nlm.nih.gov/11517472/",
      "https://pubmed.ncbi.nlm.nih.gov/29798983/"
    ]
  },
  {
    "slug": "semax-selank",
    "name": "Semax + Selank",
    "alternateNames": [],
    "description": "A catalog blend of Semax and Selank; the listed total does not specify an individual component ratio.",
    "constituents": [
      {
        "name": "Semax"
      },
      {
        "name": "Selank"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "thymosin-alpha-1",
    "name": "Thymosin Alpha-1",
    "alternateNames": [
      "Thymosin alpha 1",
      "Thymosin α1",
      "Tα1"
    ],
    "description": "Thymosin alpha 1 is indexed under Thymalfasin in PubChem.",
    "referenceMolecule": {
      "cid": 16130571,
      "name": "Thymalfasin",
      "molecularFormula": "C129H215N33O55",
      "molecularWeight": "3108.3",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/16130571"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/16130571",
      "https://pubmed.ncbi.nlm.nih.gov/35713670/",
      "https://pubmed.ncbi.nlm.nih.gov/39814420/"
    ]
  },
  {
    "slug": "dsip",
    "name": "DSIP",
    "alternateNames": [
      "Delta sleep-inducing peptide"
    ],
    "description": "DSIP expands to delta sleep-inducing peptide; its molecular reference also uses the name Emideltide.",
    "referenceMolecule": {
      "cid": 68816,
      "name": "Delta Sleep-Inducing Peptide",
      "molecularFormula": "C35H48N10O15",
      "molecularWeight": "848.8",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/68816"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/68816",
      "https://pubmed.ncbi.nlm.nih.gov/1299794/",
      "https://pubmed.ncbi.nlm.nih.gov/6895513/"
    ]
  },
  {
    "slug": "cjc-1295-no-dac-ipa",
    "name": "CJC-1295 NO DAC 5mg + IPA 5mg",
    "alternateNames": [],
    "constituents": [
      {
        "name": "CJC-1295 NO DAC",
        "amountLabel": "5 mg"
      },
      {
        "name": "IPA",
        "amountLabel": "5 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "cjc-1295-no-dac-ipa-cp20",
    "name": "CJC-1295 NO DAC 10mg + IPA 10mg",
    "alternateNames": [],
    "constituents": [
      {
        "name": "CJC-1295 NO DAC",
        "amountLabel": "10 mg"
      },
      {
        "name": "IPA",
        "amountLabel": "10 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "ipamorelin",
    "name": "Ipamorelin",
    "alternateNames": [],
    "description": "Ipamorelin is also indexed with the research identifier NNC-26-0161.",
    "referenceMolecule": {
      "cid": 9831659,
      "name": "Ipamorelin",
      "molecularFormula": "C38H49N9O5",
      "molecularWeight": "711.9",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/9831659"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/9831659",
      "https://pubmed.ncbi.nlm.nih.gov/10496658/",
      "https://pubmed.ncbi.nlm.nih.gov/25331030/"
    ]
  },
  {
    "slug": "hcg",
    "name": "HCG",
    "alternateNames": [
      "Human chorionic gonadotropin"
    ],
    "description": "Human chorionic gonadotropin is the reviewed research name associated with hCG.",
    "sourceUrls": [
      "https://pubmed.ncbi.nlm.nih.gov/12107212/"
    ]
  },
  {
    "slug": "cargrilintide",
    "name": "Cargrilintide",
    "alternateNames": [
      "Cagrilintide"
    ],
    "description": "Cagrilintide is the reviewed research spelling associated with the catalog label Cargrilintide.",
    "referenceMolecule": {
      "cid": 171397054,
      "name": "Cagrilintide",
      "molecularFormula": "C194H312N54O59S2",
      "molecularWeight": "4409",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/171397054"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/171397054",
      "https://pubmed.ncbi.nlm.nih.gov/34798060/"
    ]
  },
  {
    "slug": "sermorelin-acetate",
    "name": "Sermorelin Acetate",
    "alternateNames": [
      "GHRH(1-29)"
    ],
    "description": "PubChem describes this reference identity as an acetate salt of sermorelin, an amidated synthetic peptide.",
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/substance/483927746",
      "https://pubchem.ncbi.nlm.nih.gov/compound/Sermorelin-Acetate",
      "https://pubmed.ncbi.nlm.nih.gov/8772599/"
    ]
  },
  {
    "slug": "pt-141",
    "name": "PT-141",
    "alternateNames": [],
    "description": "PubChem indexes PT-141 under Bremelanotide and Bremelanotide Acetate. These records describe different chemical forms.",
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/9941379",
      "https://pubchem.ncbi.nlm.nih.gov/compound/91971505"
    ]
  },
  {
    "slug": "glow",
    "name": "GLOW",
    "alternateNames": [],
    "description": "GLOW lists GHK, TB and BPC as constituents; their amounts depend on the catalog variant.",
    "constituents": [
      {
        "name": "GHK"
      },
      {
        "name": "TB"
      },
      {
        "name": "BPC"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "oxytocin-acetate",
    "name": "Oxytocin Acetate",
    "alternateNames": [],
    "description": "The molecular reference describes oxytocin monoacetate. Its values apply to the recorded 1:1 form.",
    "referenceMolecule": {
      "cid": 12004215,
      "name": "Oxytocin acetate",
      "molecularFormula": "C45H70N12O14S2",
      "molecularWeight": "1067.2",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/12004215"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/12004215"
    ]
  },
  {
    "slug": "ll37",
    "name": "LL37",
    "alternateNames": [
      "LL-37"
    ],
    "description": "The LL-37 reference is also indexed under the name Ropocamptide.",
    "referenceMolecule": {
      "cid": 16198951,
      "name": "LL-37",
      "molecularFormula": "C205H340N60O53",
      "molecularWeight": "4493",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/16198951"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/16198951",
      "https://pubmed.ncbi.nlm.nih.gov/25041740/",
      "https://pubmed.ncbi.nlm.nih.gov/34687253/"
    ]
  },
  {
    "slug": "glutathione",
    "name": "Glutathione",
    "alternateNames": [],
    "description": "The molecular reference describes reduced glutathione. The catalog name alone does not establish a redox form.",
    "referenceMolecule": {
      "cid": 124886,
      "name": "Glutathione",
      "molecularFormula": "C10H17N3O6S",
      "molecularWeight": "307.33",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/124886"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/124886",
      "https://pubmed.ncbi.nlm.nih.gov/24791752/",
      "https://pubmed.ncbi.nlm.nih.gov/21875351/"
    ]
  },
  {
    "slug": "snap",
    "name": "SNAP",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "li-po-c",
    "name": "LI PO-C",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "li-po-c-without-b12",
    "name": "LI PO-C without B12",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "lemon-bottle",
    "name": "Lemon bottle",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "mt1",
    "name": "MT1",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "mt2",
    "name": "MT2",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "ss-31",
    "name": "SS-31",
    "alternateNames": [
      "Elamipretide"
    ],
    "description": "SS-31 is indexed under Elamipretide; MTP-131 is another name in the same molecular record.",
    "referenceMolecule": {
      "cid": 11764719,
      "name": "Elamipretide",
      "molecularFormula": "C32H49N9O5",
      "molecularWeight": "639.8",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/11764719"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/11764719",
      "https://pubmed.ncbi.nlm.nih.gov/33077895/",
      "https://pubmed.ncbi.nlm.nih.gov/37268435/"
    ]
  },
  {
    "slug": "klow",
    "name": "KLOW",
    "alternateNames": [],
    "description": "KLOW lists GHK, KPV, BPC and TB with individually specified component amounts.",
    "constituents": [
      {
        "name": "GHK",
        "amountLabel": "50 mg"
      },
      {
        "name": "KPV",
        "amountLabel": "10 mg"
      },
      {
        "name": "BPC",
        "amountLabel": "10 mg"
      },
      {
        "name": "TB",
        "amountLabel": "10 mg"
      }
    ],
    "sourceUrls": []
  },
  {
    "slug": "5-amino-1mq",
    "name": "5-amino-1mq",
    "alternateNames": [
      "5A1MQ",
      "5-amino-1-methylquinolinium"
    ],
    "description": "The reference describes the 5-amino-1-methylquinolinium ion. A counterion is not included in this molecular record.",
    "referenceMolecule": {
      "cid": 950107,
      "name": "5-Amino-1-methylquinolinium",
      "molecularFormula": "C10H11N2+",
      "molecularWeight": "159.21",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/950107"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/950107",
      "https://pubmed.ncbi.nlm.nih.gov/39161060/",
      "https://pubmed.ncbi.nlm.nih.gov/35013352/"
    ]
  },
  {
    "slug": "kisspeptin",
    "name": "KissPeptin",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "pinealon",
    "name": "Pinealon",
    "alternateNames": [],
    "description": "Pinealon is indexed under Glu-Asp-Arg, also named glutamyl-aspartyl-arginine.",
    "referenceMolecule": {
      "cid": 10273502,
      "name": "Glu-Asp-Arg",
      "molecularFormula": "C15H26N6O8",
      "molecularWeight": "418.40",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/10273502"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/10273502"
    ]
  },
  {
    "slug": "pe-22-28",
    "name": "PE-22-28",
    "alternateNames": [],
    "description": "PE 22-28 is the name indexed in the molecular reference. Its separate acetate record has a different formula.",
    "referenceMolecule": {
      "cid": 165437303,
      "name": "L-Arginine, glycyl-L-valyl-L-seryl-L-tryptophylglycyl-L-leucyl-",
      "molecularFormula": "C35H55N11O9",
      "molecularWeight": "773.9",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/165437303"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/165437303",
      "https://pubchem.ncbi.nlm.nih.gov/compound/172871876"
    ]
  },
  {
    "slug": "igf-1-lr3",
    "name": "IGF-1 LR3",
    "alternateNames": [
      "Long R3 IGF-I",
      "Long [R3] insulin-like growth factor-I"
    ],
    "description": "Long R3 IGF-I and Long [R3] insulin-like growth factor-I are reviewed research names associated with this catalog entry.",
    "sourceUrls": [
      "https://pubmed.ncbi.nlm.nih.gov/7561636/",
      "https://pubmed.ncbi.nlm.nih.gov/9488001/"
    ]
  },
  {
    "slug": "ara-290",
    "name": "ARA-290",
    "alternateNames": [
      "ARA 290"
    ],
    "description": "ARA-290 is indexed under Cibinetide in PubChem.",
    "referenceMolecule": {
      "cid": 91810664,
      "name": "Cibinetide",
      "molecularFormula": "C51H84N16O21",
      "molecularWeight": "1257.3",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/91810664"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/91810664",
      "https://pubmed.ncbi.nlm.nih.gov/23168581/",
      "https://pubmed.ncbi.nlm.nih.gov/24136731/"
    ]
  },
  {
    "slug": "acetic-acid",
    "name": "Acetic Acid",
    "alternateNames": [],
    "description": "Acetic acid is also indexed as ethanoic acid. The molecular reference does not specify the concentration of the catalog material.",
    "referenceMolecule": {
      "cid": 176,
      "name": "Acetic Acid",
      "molecularFormula": "C2H4O2",
      "molecularWeight": "60.05",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/176"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/176"
    ]
  },
  {
    "slug": "semaglutide",
    "name": "Semaglutide",
    "alternateNames": [],
    "description": "Semaglutide is also indexed with the research identifiers NN9535 and NNC 0113-0217.",
    "referenceMolecule": {
      "cid": 56843331,
      "name": "Semaglutide",
      "molecularFormula": "C187H291N45O59",
      "molecularWeight": "4114",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/56843331"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/56843331",
      "https://pubmed.ncbi.nlm.nih.gov/33567185/",
      "https://pubmed.ncbi.nlm.nih.gov/33667417/"
    ]
  },
  {
    "slug": "kpv",
    "name": "KPV",
    "alternateNames": [],
    "sourceUrls": [
      "https://pubmed.ncbi.nlm.nih.gov/18061177/",
      "https://pubmed.ncbi.nlm.nih.gov/27458604/"
    ]
  },
  {
    "slug": "epithalon",
    "name": "Epithalon",
    "alternateNames": [
      "Epitalon"
    ],
    "description": "Epithalon is indexed under Epitalon, also named alanyl-glutamyl-aspartyl-glycine.",
    "referenceMolecule": {
      "cid": 219042,
      "name": "Epitalon",
      "molecularFormula": "C14H22N4O9",
      "molecularWeight": "390.35",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/219042"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/219042",
      "https://pubmed.ncbi.nlm.nih.gov/40493162/",
      "https://pubmed.ncbi.nlm.nih.gov/17955380/"
    ]
  },
  {
    "slug": "cjc-1295-with-dac",
    "name": "CJC-1295 with DAC",
    "alternateNames": [
      "CJC-1295"
    ],
    "description": "CJC-1295 is the reviewed reference name associated with the catalog’s with-DAC entry.",
    "referenceMolecule": {
      "cid": 91971820,
      "name": "Cjc 1295",
      "molecularFormula": "C165H269N47O46",
      "molecularWeight": "3647.2",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/91971820"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/91971820",
      "https://pubmed.ncbi.nlm.nih.gov/16352683/",
      "https://pubmed.ncbi.nlm.nih.gov/17018654/"
    ]
  },
  {
    "slug": "cjc-1295-no-dac",
    "name": "CJC-1295 NO DAC",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "grp-2",
    "name": "GRP-2",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "vip",
    "name": "VIP",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "survodutide",
    "name": "Survodutide",
    "alternateNames": [],
    "description": "Survodutide is also indexed with the research identifier BI456906.",
    "referenceMolecule": {
      "cid": 168429725,
      "name": "Survodutide",
      "molecularFormula": "C192H289N47O61",
      "molecularWeight": "4232",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/168429725"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/168429725",
      "https://pubmed.ncbi.nlm.nih.gov/38330987/",
      "https://pubmed.ncbi.nlm.nih.gov/42253238/"
    ]
  },
  {
    "slug": "admax",
    "name": "Admax",
    "alternateNames": [],
    "sourceUrls": []
  },
  {
    "slug": "cartalax",
    "name": "Cartalax",
    "alternateNames": [],
    "description": "The Cartalax molecular reference is a tripeptide, indexed as alanyl-glutamyl-aspartic acid.",
    "referenceMolecule": {
      "cid": 87815447,
      "name": "Alanyl-glutamyl-aspartic acid",
      "molecularFormula": "C12H19N3O8",
      "molecularWeight": "333.29",
      "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/87815447"
    },
    "sourceUrls": [
      "https://pubchem.ncbi.nlm.nih.gov/compound/87815447"
    ]
  },
  {
    "slug": "bac-water",
    "name": "Bac water",
    "alternateNames": [],
    "sourceUrls": []
  }
];

function freezeProfile(profile: CompoundInformationProfile): CompoundInformationProfile {
  return Object.freeze({
    ...profile,
    alternateNames: Object.freeze([...profile.alternateNames]),
    sourceUrls: Object.freeze([...profile.sourceUrls]),
    ...(profile.constituents
      ? { constituents: Object.freeze(profile.constituents.map((entry) => Object.freeze({ ...entry }))) }
      : {}),
    ...(profile.referenceMolecule
      ? { referenceMolecule: Object.freeze({ ...profile.referenceMolecule }) }
      : {}),
  });
}

export const compoundInformationProfiles: readonly CompoundInformationProfile[] =
  Object.freeze(profileRecords.map(freezeProfile));

const profilesBySlug = new Map(
  compoundInformationProfiles.map((profile) => [profile.slug, profile] as const),
);

export function getCompoundInformation(slug: string): CompoundInformationProfile | null {
  return profilesBySlug.get(slug) ?? null;
}
