# Sortie statique vide

Toutes les requêtes sont routées vers la fonction serverless `apps/api/api/index.ts`
(voir `vercel.json`). Ce dossier existe uniquement pour satisfaire l'étape de build
Vercel, qui attend un répertoire de sortie statique.
