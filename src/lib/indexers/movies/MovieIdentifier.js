import path from 'path';
import fs from 'fs';
import databases from '../../../submodules/database';
import queue from '../../../submodules/queue';
import tmdb from '../../../submodules/tmdb';
import UserManager from '../../../submodules/users';
import config from '../../../config.js';
import guessit from '../../../submodules/guessit';
import ffprobe from '../../../submodules/ffprobe';

import MovieSetCollector from './MovieSetCollector';

// TODO: Add config option to use the parent directory to identify movies

async function identifyByName(name) {
    // If the year is present at the end of the name, remove it for the search
    // TODO: Using a regex mach, retrieve the year and use it in the search processes
    name = name.replace(/ \([0-9][0-9][0-9][0-9]\)/g, '');

    return await tmdb.searchMovie({ query: name });
}

async function identifyByGuess (basename) {
    var identification = await guessit.identify(basename);

    let query = {query: identification.title};

    if (identification.year) {
        query.year = identification.year;
    }

    return await tmdb.searchMovie(query);
}

export default async function (moviePath, reIndex) {
    let metadata = {};
    let duration = 0;

    try {
        metadata = await ffprobe(moviePath);
        duration = metadata.format.duration;
    } catch (e) {
        console.log('Could not analyse ', moviePath, ' for duration');
    }

    let parsedPath = path.parse(moviePath);
    parsedPath.ext = parsedPath.ext.replace('.', '').toLowerCase()

    // Create file entity in the database
    let [file, FileInserted] = await databases.file.findOrCreate({
        where: {path: moviePath},
        defaults: {
            name: parsedPath.name,
            directory: parsedPath.dir,
            extension: parsedPath.ext,

            duration
        }
    });

    if (FileInserted) {
        console.log('File inserted:', moviePath);
    } else {
        console.log('File already in database:', moviePath);

        // Don't both indexing the file if it's already in the file database.
        // It was probably already indexed
        if (!reIndex) {
            return false;
        }
    }

    let res = await identifyByGuess(path.basename(moviePath));


    if (!res || res.total_results < 1) {
        console.log('Could not identify', moviePath, 'using guessit');
        console.log('Attempting to identify', moviePath, 'using only the file name');


        res = await identifyByName(path.basename(parsedPath.name));
    }

    if (!res || res.total_results < 1) {
        console.log('Could not identify', moviePath, 'by file name');
        console.log('Attempting to identify', moviePath, 'by containing folder');


        res = await identifyByName(path.basename(parsedPath.dir));
    }

    if (!res || res.total_results < 1) {
        console.log('Could not identify', moviePath);
        return false;
    }


    let data = res.results[0];

    let [movie, MovieInserted] = await databases.movie
        .findOrCreate({
            where: {tmdbid: data.id}, defaults: {
                movieName: data.title,
                popularity: data.popularity,
                releaseDate: data.release_date,
                overview: data.overview,
                file: moviePath
            }
        });

    movie.addFile(file);

    MovieSetCollector.GetSetsForMovie(movie);


    if (MovieInserted) {
        console.log(movie.movieName, 'added to database');

        // Inform all connected clients that a new movie has been imported
        UserManager.sendToAll('indexer', {event: 'added', type: 'movie'});
    } else {
        console.log(movie.movieName, 'was already in the database');
    }

    if (config.transcoding[file.extension] !== undefined && config.transcoding[file.extension] !== false) {
        queue.push({task: 'transcode', path: moviePath}, async function (err) {
            // Determine the file path of the transcoded file
            let parsed = path.parse(moviePath);
            let extension = parsed.ext.replace('.', '').toLowerCase();
            let transcodedPath = moviePath.replace(parsed.ext, '.' + config.transcoding[extension]);

            // Insert the new file and link it to the movie entity
            let [file, FileInserted] = await databases.file.findOrCreate({
                where: {path: transcodedPath},
                defaults: {
                    name: path.parse(transcodedPath).name,
                    directory: path.parse(transcodedPath).dir,
                    extension: path.parse(transcodedPath).ext.replace('.', '').toLowerCase()
                }
            });


            movie.addFile(file).then(() => {
                movie.save();
            });
        });
    }

    return true;
}