<?php

use App\Enums\TrackingType;

return [
    [
        'key'           => 'chess_games',
        'name'          => 'Chess Games',
        'description'   => 'Play full chess games to build practical experience.',
        'tracking_type' => TrackingType::Count->value,
        'daily_target'  => 2,
        'unit'          => 'games',
    ],
    [
        'key'           => 'chess_puzzles',
        'name'          => 'Chess Puzzles',
        'description'   => 'Solve tactical puzzles to sharpen calculation.',
        'tracking_type' => TrackingType::Count->value,
        'daily_target'  => 10,
        'unit'          => 'puzzles',
    ],
    [
        'key'           => 'opening_study',
        'name'          => 'Opening Study',
        'description'   => 'Study opening theory and repertoire.',
        'tracking_type' => TrackingType::Duration->value,
        'daily_target'  => 20,   // minutes
        'unit'          => 'minutes',
    ],
    [
        'key'           => 'game_analysis',
        'name'          => 'Game Analysis',
        'description'   => 'Analyse your own games to find mistakes and improvements.',
        'tracking_type' => TrackingType::Duration->value,
        'daily_target'  => 30,   // minutes
        'unit'          => 'minutes',
    ],
    [
        'key'           => 'endgame_study',
        'name'          => 'Endgame Study',
        'description'   => 'Study endgame techniques and theoretical positions.',
        'tracking_type' => TrackingType::Duration->value,
        'daily_target'  => 15,   // minutes
        'unit'          => 'minutes',
    ],
    [
        'key'           => 'chess_reading',
        'name'          => 'Chess Reading',
        'description'   => 'Read chess books or articles.',
        'tracking_type' => TrackingType::Duration->value,
        'daily_target'  => 20,   // minutes
        'unit'          => 'minutes',
    ],
    [
        'key'           => 'chess_lessons',
        'name'          => 'Chess Lessons',
        'description'   => 'Take a structured lesson or watch instructional content.',
        'tracking_type' => TrackingType::Checkbox->value,
        'daily_target'  => 1,
        'unit'          => null,
    ],
];
