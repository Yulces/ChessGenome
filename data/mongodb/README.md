# Base de datos MongoDB - ChessGenome

Dump comprimido de la base de datos `chessgenome` (MongoDB 7).

## Contenido

- `chessgenome_mongo_dump.gz`: dump en formato archive comprimido con gzip.
  Colecciones: `positions`, `transitions`, `pgns`, `comments`, `authors`, `training_samples`, `neural_models`.

## Restaurar

Con el contenedor de MongoDB en marcha:

    docker exec -i chessgenome-mongodb mongorestore --archive --gzip --drop < chessgenome_mongo_dump.gz

`--drop` elimina las colecciones existentes antes de restaurar. Quítalo si quieres hacer merge.

## Generar el dump de nuevo

    docker exec chessgenome-mongodb mongodump --db chessgenome --excludeCollection=users --archive --gzip > chessgenome_mongo_dump.gz
